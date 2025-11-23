import Participants from '../models/Participants.js';

export const participantController = {
  // 🎯 AJOUTER UN PARTICIPANT À UNE CONVERSATION
  addParticipant: async (Id_User, Id_Conversation, Role = 'membre') => {
    const participant = new Participants({
      Id_User: Id_User,
      Id_Conversation: Id_Conversation,
      Role: Role,
      joinedAt: new Date()
    });

    const savedParticipant = await participant.save();
    console.log('✅ Participant ajouté:', savedParticipant._id);
    return savedParticipant;
  },

  // 🎯 AJOUTER PLUSIEURS PARTICIPANTS (pour nouvelles conversations)
  addParticipants: async (participantsData) => {
    const participants = await Participants.create(participantsData);
    console.log('✅ Participants créés:', participants.length);
    return participants;
  },

  // 🎯 SUPPRIMER UN PARTICIPANT
  removeParticipant: async (Id_User, Id_Conversation) => {
    const result = await Participants.deleteOne({
      Id_User: Id_User,
      Id_Conversation: Id_Conversation
    });
    console.log('✅ Participant supprimé');
    return result;
  },

  // 🎯 CHANGER LE RÔLE D'UN PARTICIPANT
  updateParticipantRole: async (Id_User, Id_Conversation, newRole) => {
    const participant = await Participants.findOneAndUpdate(
      { Id_User: Id_User, Id_Conversation: Id_Conversation },
      { Role: newRole },
      { new: true }
    );
    console.log('✅ Rôle mis à jour:', newRole);
    return participant;
  },

  // 🎯 RÉCUPÉRER LES PARTICIPANTS D'UNE CONVERSATION
  getConversationParticipants: async (Id_Conversation) => {
    return await Participants.find({ Id_Conversation: Id_Conversation })
      .populate('Id_User', 'username email profilePicture'); // Infos user
  },

  // 🎯 RÉCUPÉRER LES CONVERSATIONS D'UN USER
  getUserConversations: async (Id_User) => {
    return await Participants.find({ Id_User: Id_User })
      .populate('Id_Conversation');
  },

  // 🎯 VÉRIFIER SI UN USER EST DANS UNE CONVERSATION
  isUserInConversation: async (Id_User, Id_Conversation) => {
    const participant = await Participants.findOne({
      Id_User: Id_User,
      Id_Conversation: Id_Conversation
    });
    return !!participant;
  }
};
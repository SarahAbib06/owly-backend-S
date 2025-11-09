import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required:true },
Id_sender: {type: mongoose.Schema.Types.ObjectId,ref: 'User', required: true},
//id_receiver: {type: mongoose.Schema.Types.ObjectId,ref: 'Participant',required: false},
readBy: [{
type: mongoose.Schema.Types.ObjectId,ref: 'Participant'
}],

content: {
type: String,
default: null
},
typeMessage: {
type: String,
enum: ['text', 'image', 'video', 'audio', 'file', 'emojis'],default: 'text'},
status: {
type: String,
enum: ['sent', 'delivered', 'seen'],
default: 'sent'
},

time: {
type: Date,
default: Date.now
}
});


export default mongoose.model("Message", messageSchema);
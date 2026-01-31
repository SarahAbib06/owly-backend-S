// models/Poll.js
import mongoose from "mongoose";

const { Schema, model } = mongoose;

const pollOptionSchema = new Schema({
  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  voters: [
    {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  voteCount: {
    type: Number,
    default: 0,
  },
});

const pollSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    question: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    options: {
      type: [pollOptionSchema],
      validate: {
        validator: function (options) {
          return options.length >= 2 && options.length <= 6;
        },
        message: "Un sondage doit avoir entre 2 et 6 options",
      },
      required: true,
    },
    isMultiChoice: {
      type: Boolean,
      default: false,
    },
    isAnonymous: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      default: function () {
        const oneWeek = new Date();
        oneWeek.setDate(oneWeek.getDate() + 7);
        return oneWeek;
      },
    },
    isClosed: {
      type: Boolean,
      default: false,
    },
    totalVotes: {
      type: Number,
      default: 0,
    },
    voters: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes pour performances
pollSchema.index({ conversationId: 1, createdAt: -1 });
pollSchema.index({ expiresAt: 1 });
pollSchema.index({ createdBy: 1 });
pollSchema.index({ isClosed: 1 });

// Méthode pour vérifier si un utilisateur a déjà voté
pollSchema.methods.hasUserVoted = function (userId) {
  return this.voters.some((voter) => voter.toString() === userId.toString());
};

// ✅ CORRECTION: Méthode pour ajouter un vote avec validation améliorée
pollSchema.methods.addVote = function (userId, optionIndexes) {
  console.log("🔄 Méthode addVote appelée:", {
    userId,
    optionIndexes,
    nombreOptions: this.options.length,
    optionsDisponibles: this.options.map((opt, idx) => `${idx}: ${opt.text}`),
  });

  if (this.isClosed) {
    throw new Error("Ce sondage est fermé");
  }

  if (this.expiresAt && new Date() > this.expiresAt) {
    throw new Error("Ce sondage a expiré");
  }

  if (this.hasUserVoted(userId)) {
    throw new Error("Vous avez déjà voté à ce sondage");
  }

  const optionIndices = Array.isArray(optionIndexes)
    ? optionIndexes
    : [optionIndexes];

  if (!this.isMultiChoice && optionIndices.length > 1) {
    throw new Error("Ce sondage ne permet pas les choix multiples");
  }

  // ✅ CORRECTION: Validation améliorée des options
  if (!this.options || !Array.isArray(this.options)) {
    throw new Error("Les options du sondage ne sont pas valides");
  }

  optionIndices.forEach((index) => {
    // Validation stricte du type et de la plage
    if (
      typeof index !== "number" ||
      index < 0 ||
      index >= this.options.length
    ) {
      throw new Error(
        `Option invalide à l'index ${index}. Index doit être entre 0 et ${
          this.options.length - 1
        }`
      );
    }

    const option = this.options[index];
    if (!option) {
      throw new Error(`Option non trouvée à l'index ${index}`);
    }

    // ✅ CORRECTION: S'assurer que voters existe
    if (!option.voters) {
      option.voters = [];
    }

    // Vérifier que l'utilisateur n'a pas déjà voté pour cette option
    const alreadyVotedForOption = option.voters.some(
      (voter) => voter.toString() === userId.toString()
    );

    if (alreadyVotedForOption) {
      throw new Error(`Vous avez déjà voté pour l'option "${option.text}"`);
    }

    option.voters.push(userId);
    option.voteCount = (option.voteCount || 0) + 1;
    console.log(`✅ Vote ajouté pour l'option ${index}: "${option.text}"`);
  });

  this.voters.push(userId);
  this.totalVotes = (this.totalVotes || 0) + 1;

  console.log(`✅ Vote enregistré. Total votes: ${this.totalVotes}`);
  return this;
};

// Middleware pour mettre à jour le compteur de votes avant sauvegarde
pollSchema.pre("save", function (next) {
  // S'assurer que totalVotes est égal au nombre de votants uniques
  this.totalVotes = this.voters.length;

  // S'assurer que chaque option a un voteCount correct
  if (this.options && Array.isArray(this.options)) {
    this.options.forEach((option) => {
      if (option.voters && Array.isArray(option.voters)) {
        option.voteCount = option.voters.length;
      }
    });
  }

  next();
});

const Poll = model("Poll", pollSchema);

export default Poll;

import mongoose from "mongoose";

const pushSubscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true, // pour trouver rapidement tous les abonnements d'un utilisateur
  },
  subscription: {
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Un même navigateur (endpoint) ne s'abonne qu'une seule fois
pushSubscriptionSchema.index({ "subscription.endpoint": 1 }, { unique: true });

// Mise à jour automatique de updatedAt
pushSubscriptionSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model("PushSubscription", pushSubscriptionSchema);
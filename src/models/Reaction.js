import mongoose from 'mongoose';

const reactionSchema = new mongoose.Schema({
Id_message: [{
type: mongoose.Schema.Types.ObjectId,ref: 'Message',required: true
}],
id_user: {type: mongoose.Schema.Types.ObjectId,ref: 'User',required: true},
content: {
type: String,
required: true ,
},
time: {
type: Date,
default: Date.now
}

  });
  
  export default mongoose.model("Reaction", reactionSchema);
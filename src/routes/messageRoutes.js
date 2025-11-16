import express from 'express';
import { messageController } from '../controllers/messageController.js';

const router = express.Router();

// 🎯 ROUTE : GET /api/messages/:conversationId
router.get('/:conversationId', async (req, res) => {
  try {
    console.log('📨 API - Récupération messages conversation:', req.params.conversationId);
    
    const { conversationId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    
    const messages = await messageController.getConversationMessages(conversationId, page, limit);
    
    console.log(`✅ API - ${messages.length} messages récupérés`);
    res.json({
      success: true,
      messages: messages,
      page: page,
      hasMore: messages.length === limit
    });
    
  } catch (error) {
    console.error('❌ API - Erreur:', error.message);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});
// 🆕 ROUTE : POST /api/messages/send
router.post('/send', async (req, res) => {
  try {
    console.log('📨 API - Envoi message:', req.body);
    
    const { conversationId, Id_sender, Id_receiver, content, typeMessage } = req.body;
    
    const messageData = {
      conversationId,
      Id_sender, 
      Id_receiver,
      content,
      typeMessage: typeMessage || 'text'
    };
    
    const savedMessage = await messageController.createMessage(messageData);
    
    console.log('✅ API - Message envoyé:', savedMessage._id);
    res.json({
      success: true,
      data: savedMessage
    });
    
  } catch (error) {
    console.error('❌ API - Erreur envoi message:', error.message);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

export default router;
import express from "express";
import { padController } from "../controllers/padController.js";
import { protact } from "../middleware/authen.js";
import rateLimit from "express-rate-limit";

const router = express.Router();

// 🆕 RATE LIMITING POUR PRÉVENTION DOS
const padLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requêtes max par IP
  message: {
    success: false,
    error: "Trop de requêtes, veuillez réessayer plus tard"
  },
  standardHeaders: true,
  legacyHeaders: false
});

// 🆕 VALIDATION MIDDLEWARE
const validatePadUpdate = (req, res, next) => {
  const { content } = req.body;
  
  if (content && content.length > 100000) { // 100KB max
    return res.status(400).json({
      success: false,
      error: "Le contenu dépasse la taille maximale autorisée (100KB)"
    });
  }
  
  next();
};

// 🆕 AUDIT LOGGING MIDDLEWARE
const auditLog = (action) => {
  return (req, res, next) => {
    const startTime = Date.now();
    
    // Log après la réponse
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const userId = req.user?._id || "anonymous";
      const conversationId = req.params.conversationId;
      
      console.log(`📊 AUDIT: ${action} | User: ${userId} | Conversation: ${conversationId} | Duration: ${duration}ms | Status: ${res.statusCode}`);
    });
    
    next();
  };
};

// 🎯 GET Pad avec cache et métadonnées
router.get("/:conversationId", protact, padLimiter, auditLog("get_pad"), async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    const { cache = "true" } = req.query;
    
    const useCache = cache !== "false";
    const pad = await padController.getOrCreatePad(conversationId, userId, useCache);
    
    // 🆕 VÉRIFIER LES PERMISSIONS
    const canEdit = pad.canUserEdit ? pad.canUserEdit(userId) : true;
    const accessLevel = pad.getUserAccessLevel ? pad.getUserAccessLevel(userId) : "edit";
    
    const stats = padController.getProgressStats(pad);
    const suggestions = await padController.getSuggestions(conversationId, userId);
    
    // 🆕 EN-TÊTES DE CACHE
    res.set('X-Pad-Version', pad.version || 0);
    res.set('X-Pad-Cached', useCache ? 'true' : 'false');
    res.set('X-User-Access-Level', accessLevel);
    
    res.json({
      success: true,
      pad: {
        _id: pad._id,
        content: pad.content,
        mode: pad.mode,
        version: pad.version || 0,
        stats: stats,
        suggestions: suggestions,
        completedItems: pad.completedItems,
        assignedItems: pad.assignedItems,
        preferences: pad.preferences || {},
        accessLevel: accessLevel,
        canEdit: canEdit,
        lastUpdatedBy: pad.lastUpdatedBy,
        updatedAt: pad.updatedAt,
        metrics: pad.metrics || {},
        templateId: pad.templateId
      }
    });
  } catch (error) {
    console.error("❌ Erreur récupération Pad:", error);
    
    // 🆕 ERREURS SPÉCIFIQUES
    let status = 500;
    let message = error.message;
    
    if (error.message.includes("Accès non autorisé")) {
      status = 403;
      message = "Vous n'avez pas accès à ce pad";
    } else if (error.message.includes("non trouvé")) {
      status = 404;
      message = "Pad non trouvé";
    }
    
    res.status(status).json({
      success: false,
      error: message,
      code: error.code || "PAD_ERROR"
    });
  }
});

// 🎯 UPDATE Pad Content avec buffer et validation
router.put("/:conversationId/content", protact, padLimiter, validatePadUpdate, auditLog("update_content"), async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    const { content, mode, operation, buffer = "false" } = req.body;
    
    let updatedPad;
    
    // 🆕 MODE BUFFER OU DIRECT
    if (buffer === "true" && operation) {
      updatedPad = await padController.updateBuffered(
        conversationId, 
        userId, 
        content, 
        mode
      );
    } else {
      updatedPad = await padController.updatePadContent(
        conversationId, 
        userId, 
        content, 
        mode,
        operation
      );
    }
    
    const stats = padController.getProgressStats(updatedPad);
    const suggestions = await padController.getSuggestions(conversationId, userId);

    // 🆕 EN-TÊTES DE RÉPONSE
    res.set('X-Pad-Version', updatedPad.version);
    res.set('X-Update-Type', buffer === "true" ? 'buffered' : 'immediate');

    // 🎯 DIFFUSION TEMPS RÉEL AVEC OPTIMISATION
    const io = req.app.get("io");
    if (io) {
      // 🆕 ENVOYER SEULEMENT LES DONNÉES NÉCESSAIRES
      const broadcastData = {
        type: "content_updated",
        pad: {
          _id: updatedPad._id,
          content: operation ? null : updatedPad.content, // Si operation, laisser le client recalculer
          operation: operation || null,
          mode: updatedPad.mode,
          version: updatedPad.version,
          stats: stats,
          lastUpdatedBy: updatedPad.lastUpdatedBy,
          updatedAt: updatedPad.updatedAt
        },
        updatedBy: {
          _id: userId,
          username: req.user.username
        },
        timestamp: new Date(),
        suggestions: suggestions
      };

      // 🆕 COMPRESSION POUR LES GRANDS PADS
      if (updatedPad.content.length > 10000) {
        broadcastData.compressed = true;
        broadcastData.contentLength = updatedPad.content.length;
      }

      io.to(conversationId).emit("pad_updated", broadcastData);
      
      // 🆕 NOTIFICATION POUR LES UTILISATEURS ASSIGNÉS
      if (operation && operation.type === "insert") {
        // Détecter les mentions @username
        const mentionRegex = /@(\w+)/g;
        const mentions = operation.text?.match(mentionRegex);
        
        if (mentions) {
          mentions.forEach(mention => {
            const username = mention.substring(1);
            // Envoyer notification à l'utilisateur mentionné
            io.to(`user_${username}`).emit("pad_mention", {
              conversationId,
              mentionedBy: req.user.username,
              text: operation.text.substring(0, 50),
              timestamp: new Date()
            });
          });
        }
      }
    }

    res.json({
      success: true,
      pad: updatedPad,
      stats: stats,
      suggestions: suggestions,
      version: updatedPad.version,
      buffered: buffer === "true"
    });
  } catch (error) {
    console.error("❌ Erreur mise à jour Pad:", error);
    
    let status = 500;
    if (error.message.includes("permission")) {
      status = 403;
    } else if (error.message.includes("non trouvé")) {
      status = 404;
    }
    
    res.status(status).json({
      success: false,
      error: error.message,
      code: "UPDATE_ERROR"
    });
  }
});

// 🎯 TOGGLE Todo Item avec métadonnées
router.post("/:conversationId/toggle-item", protact, padLimiter, auditLog("toggle_item"), async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    const { lineIndex, completed, metadata = {} } = req.body;
    
    if (typeof lineIndex !== 'number') {
      throw new Error("lineIndex doit être un nombre");
    }

    const updatedPad = await padController.toggleTodoItem(
      conversationId,
      userId,
      lineIndex,
      completed,
      metadata
    );

    const stats = padController.getProgressStats(updatedPad);
    const suggestions = await padController.getSuggestions(conversationId, userId);

    // 🎯 DIFFUSION TEMPS RÉEL OPTIMISÉE
    const io = req.app.get("io");
    if (io) {
      io.to(conversationId).emit("pad_updated", {
        type: "item_toggled",
        lineIndex: lineIndex,
        completed: completed,
        completedBy: {
          _id: userId,
          username: req.user.username
        },
        metadata: metadata,
        stats: stats,
        suggestions: suggestions,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      completed: completed,
      stats: stats,
      suggestions: suggestions,
      metadata: metadata
    });
  } catch (error) {
    console.error("❌ Erreur toggle item:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: "TOGGLE_ERROR"
    });
  }
});

// 🎯 ASSIGN Item avec métadonnées
router.post("/:conversationId/assign-item", protact, padLimiter, auditLog("assign_item"), async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    const { lineIndex, assignToUserId, metadata = {} } = req.body;

    const updatedPad = await padController.assignItem(
      conversationId,
      userId,
      lineIndex,
      assignToUserId,
      metadata
    );

    const stats = padController.getProgressStats(updatedPad);

    // 🎯 DIFFUSION TEMPS RÉEL + NOTIF PUSH OPTIMISÉ
    const io = req.app.get("io");
    if (io) {
      const broadcastData = {
        type: "item_assigned",
        lineIndex: lineIndex,
        assignedTo: assignToUserId,
        assignedBy: {
          _id: userId,
          username: req.user.username
        },
        metadata: metadata,
        timestamp: new Date(),
        stats: stats
      };

      // 1. À tous les participants du pad
      io.to(conversationId).emit("pad_updated", broadcastData);

      // 2. Notif push spécifique à la personne assignée (seulement si notify = true)
      if (metadata.notify !== false) {
        io.to(`user_${assignToUserId}`).emit("task_assigned", {
          conversationId: conversationId,
          lineIndex: lineIndex,
          assignedBy: req.user.username,
          metadata: metadata,
          timestamp: new Date(),
          priority: metadata.priority || "medium"
        });
      }
    }

    res.json({
      success: true,
      assignedTo: assignToUserId,
      metadata: metadata,
      stats: stats
    });
  } catch (error) {
    console.error("❌ Erreur assignation item:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: "ASSIGN_ERROR"
    });
  }
});

// 🎯 TOGGLE Mode avec formatage intelligent
router.post("/:conversationId/toggle-mode", protact, padLimiter, auditLog("toggle_mode"), async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    const { mode } = req.body;
    
    if (!["text", "todo"].includes(mode)) {
      throw new Error("Mode invalide. Doit être 'text' ou 'todo'");
    }

    const updatedPad = await padController.toggleMode(
      conversationId,
      userId,
      mode
    );

    // Formater le contenu selon le mode
    let formattedContent = updatedPad.content;
    if (mode === "todo") {
      formattedContent = padController.formatContentForTodo(updatedPad.content);
    } else {
      formattedContent = padController.formatContentForText(updatedPad.content);
    }

    // Mettre à jour avec le contenu formaté
    const finalPad = await padController.updatePadContent(
      conversationId,
      userId,
      formattedContent,
      mode
    );

    const stats = padController.getProgressStats(finalPad);
    const suggestions = await padController.getSuggestions(conversationId, userId);

    // 🎯 DIFFUSION TEMPS RÉEL AVEC CONTEXTE
    const io = req.app.get("io");
    if (io) {
      io.to(conversationId).emit("pad_updated", {
        type: "mode_changed",
        mode: mode,
        content: formattedContent,
        stats: stats,
        suggestions: suggestions,
        updatedBy: {
          _id: userId,
          username: req.user.username
        },
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      mode: mode,
      content: formattedContent,
      stats: stats,
      suggestions: suggestions
    });
  } catch (error) {
    console.error("❌ Erreur changement mode:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: "MODE_ERROR"
    });
  }
});

// 🎯 CLEAR Pad avec backup optionnel
router.delete("/:conversationId/clear", protact, auditLog("clear_pad"), async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    const { backup = "true" } = req.query;
    
    const doBackup = backup === "true";

    await padController.clearPad(conversationId, userId, doBackup);

    // 🎯 DIFFUSION TEMPS RÉEL
    const io = req.app.get("io");
    if (io) {
      io.to(conversationId).emit("pad_updated", {
        type: "pad_cleared",
        clearedBy: {
          _id: userId,
          username: req.user.username
        },
        backedUp: doBackup,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: "Pad vidé avec succès",
      backedUp: doBackup
    });
  } catch (error) {
    console.error("❌ Erreur vidage Pad:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: "CLEAR_ERROR"
    });
  }
});

// 🆕 NOUVELLES ROUTES

// 🎯 GET Pad History
router.get("/:conversationId/history", protact, padLimiter, auditLog("get_history"), async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    const { limit = 50 } = req.query;
    
    const pad = await padController.getOrCreatePad(conversationId, userId);
    
    if (!pad.versionHistory) {
      return res.json({
        success: true,
        history: [],
        total: 0
      });
    }
    
    const history = pad.versionHistory
      .slice(0, parseInt(limit))
      .map(version => ({
        content: version.content.substring(0, 500), // Preview seulement
        mode: version.mode,
        version: version.version,
        updatedBy: version.updatedBy,
        updatedAt: version.updatedAt,
        operationCount: version.operations?.length || 0
      }));
    
    res.json({
      success: true,
      history: history,
      total: pad.versionHistory.length,
      currentVersion: pad.version || 0
    });
  } catch (error) {
    console.error("❌ Erreur historique Pad:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: "HISTORY_ERROR"
    });
  }
});

// 🎯 RESTORE Pad Version
router.post("/:conversationId/restore", protact, auditLog("restore_version"), async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    const { versionIndex } = req.body;
    
    if (typeof versionIndex !== 'number') {
      throw new Error("versionIndex doit être un nombre");
    }
    
    const restoredPad = await padController.restoreVersion(
      conversationId,
      userId,
      versionIndex
    );
    
    const stats = padController.getProgressStats(restoredPad);
    
    // DIFFUSION TEMPS RÉEL
    const io = req.app.get("io");
    if (io) {
      io.to(conversationId).emit("pad_updated", {
        type: "version_restored",
        version: restoredPad.version,
        restoredBy: {
          _id: userId,
          username: req.user.username
        },
        content: restoredPad.content,
        stats: stats,
        timestamp: new Date()
      });
    }
    
    res.json({
      success: true,
      pad: restoredPad,
      version: restoredPad.version,
      stats: stats
    });
  } catch (error) {
    console.error("❌ Erreur restauration Pad:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: "RESTORE_ERROR"
    });
  }
});

// 🎯 UPDATE Pad Preferences
router.put("/:conversationId/preferences", protact, auditLog("update_preferences"), async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    const { preferences } = req.body;
    
    if (!preferences || typeof preferences !== 'object') {
      throw new Error("Préférences invalides");
    }
    
    const updatedPad = await padController.updatePreferences(
      conversationId,
      userId,
      preferences
    );
    
    // DIFFUSION TEMPS RÉEL POUR LES CHANGEMENTS VISIBLES
    const io = req.app.get("io");
    if (io && (preferences.theme || preferences.fontSize)) {
      io.to(conversationId).emit("pad_updated", {
        type: "preferences_updated",
        preferences: updatedPad.preferences,
        updatedBy: {
          _id: userId,
          username: req.user.username
        },
        timestamp: new Date()
      });
    }
    
    res.json({
      success: true,
      preferences: updatedPad.preferences
    });
  } catch (error) {
    console.error("❌ Erreur mise à jour préférences:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: "PREFERENCES_ERROR"
    });
  }
});

// 🎯 UPDATE Access Level
router.put("/:conversationId/access", protact, auditLog("update_access"), async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    const { targetUserId, level } = req.body;
    
    if (!["read", "comment", "edit", "admin"].includes(level)) {
      throw new Error("Niveau d'accès invalide");
    }
    
    const updatedPad = await padController.updateAccessLevel(
      conversationId,
      userId,
      targetUserId,
      level
    );
    
    // NOTIFICATION À L'UTILISATEUR CONCERNÉ
    const io = req.app.get("io");
    if (io) {
      io.to(`user_${targetUserId}`).emit("pad_access_changed", {
        conversationId,
        newLevel: level,
        changedBy: req.user.username,
        timestamp: new Date()
      });
    }
    
    res.json({
      success: true,
      accessLevel: level,
      targetUserId: targetUserId
    });
  } catch (error) {
    console.error("❌ Erreur mise à jour accès:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: "ACCESS_ERROR"
    });
  }
});

// 🎯 GET Pad Report
router.get("/:conversationId/report", protact, auditLog("get_report"), async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    
    const report = await padController.generateReport(conversationId, userId);
    
    // 🆕 EN-TÊTES POUR TÉLÉCHARGEMENT
    const timestamp = new Date().toISOString().split('T')[0];
    res.set({
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="pad-report-${conversationId}-${timestamp}.json"`
    });
    
    res.json({
      success: true,
      report: report,
      generatedAt: new Date(),
      generatedBy: userId
    });
  } catch (error) {
    console.error("❌ Erreur génération rapport:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: "REPORT_ERROR"
    });
  }
});

// 🎯 APPLY Template
router.post("/:conversationId/apply-template", protact, auditLog("apply_template"), async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    const { templateId } = req.body;
    
    const updatedPad = await padController.applyTemplate(
      conversationId,
      userId,
      templateId
    );
    
    const stats = padController.getProgressStats(updatedPad);
    
    // DIFFUSION TEMPS RÉEL
    const io = req.app.get("io");
    if (io) {
      io.to(conversationId).emit("pad_updated", {
        type: "template_applied",
        templateId: templateId,
        content: updatedPad.content,
        mode: updatedPad.mode,
        stats: stats,
        updatedBy: {
          _id: userId,
          username: req.user.username
        },
        timestamp: new Date()
      });
    }
    
    res.json({
      success: true,
      templateId: templateId,
      pad: updatedPad,
      stats: stats
    });
  } catch (error) {
    console.error("❌ Erreur application template:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: "TEMPLATE_ERROR"
    });
  }
});

// 🎯 SEARCH in Pad
router.get("/:conversationId/search", protact, padLimiter, auditLog("search_pad"), async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        error: "Terme de recherche trop court (min 2 caractères)"
      });
    }
    
    const pad = await padController.getOrCreatePad(conversationId, req.user._id);
    
    const lines = pad.content.split('\n');
    const results = lines
      .map((line, index) => ({
        line: line,
        index: index,
        lineNumber: index + 1
      }))
      .filter(item => 
        item.line.toLowerCase().includes(q.toLowerCase())
      )
      .map(item => ({
        ...item,
        preview: item.line.substring(0, 100) + (item.line.length > 100 ? '...' : ''),
        matchedText: item.line.replace(
          new RegExp(`(${q})`, 'gi'),
          '<mark>$1</mark>'
        )
      }));
    
    res.json({
      success: true,
      query: q,
      results: results,
      count: results.length,
      totalLines: lines.length
    });
  } catch (error) {
    console.error("❌ Erreur recherche Pad:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: "SEARCH_ERROR"
    });
  }
});

// 🎯 GET System Stats (Admin)
router.get("/system/stats", protact, auditLog("system_stats"), async (req, res) => {
  try {
    // 🆕 VÉRIFIER SI ADMIN
    const user = req.user;
    if (user.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Accès réservé aux administrateurs"
      });
    }
    
    const stats = padController.getSystemStats();
    
    // 🆕 STATISTIQUES AVANCÉES
    const padCount = await Pad.countDocuments();
    const activePads = await Pad.countDocuments({
      "metrics.lastActiveAt": { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    
    const userCount = await Participants.aggregate([
      { $group: { _id: "$Id_User" } },
      { $count: "total" }
    ]);
    
    res.json({
      success: true,
      stats: {
        ...stats,
        database: {
          totalPads: padCount,
          activePads: activePads,
          totalUsers: userCount[0]?.total || 0
        },
        performance: {
          avgResponseTime: null, // À implémenter avec monitoring
          cacheHitRate: null
        }
      },
      timestamp: new Date()
    });
  } catch (error) {
    console.error("❌ Erreur stats système:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: "SYSTEM_STATS_ERROR"
    });
  }
});

// 🆕 HEALTH CHECK
router.get("/health", async (req, res) => {
  try {
    // Vérifier la connexion à la base de données
    await Pad.findOne().limit(1);
    
    const health = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: "connected",
      cache: "active",
      version: "1.0.0"
    };
    
    res.set('Cache-Control', 'no-cache');
    res.json(health);
  } catch (error) {
    console.error("❌ Health check failed:", error);
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 🆕 404 POUR LES ROUTES INEXISTANTES
router.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route Pad non trouvée",
    availableRoutes: [
      "GET    /:conversationId",
      "PUT    /:conversationId/content",
      "POST   /:conversationId/toggle-item",
      "POST   /:conversationId/assign-item",
      "POST   /:conversationId/toggle-mode",
      "DELETE /:conversationId/clear",
      "GET    /:conversationId/history",
      "POST   /:conversationId/restore",
      "PUT    /:conversationId/preferences",
      "PUT    /:conversationId/access",
      "GET    /:conversationId/report",
      "POST   /:conversationId/apply-template",
      "GET    /:conversationId/search",
      "GET    /system/stats",
      "GET    /health"
    ]
  });
});

export default router;
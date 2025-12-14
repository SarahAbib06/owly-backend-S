import Pad from "../models/Pad.js";
import Conversation from "../models/Conversation.js";
import Participants from "../models/Participants.js";
import User from "../models/User.js";
import Template from "../models/Template.js";

// 🆕 CACHE ET BUFFERING
const updateBuffer = new Map(); // conversationId -> {buffer, timeout}
const padCache = new Map(); // conversationId -> {pad, timestamp}
const CACHE_TTL = 300000; // 5 minutes
const BUFFER_DELAY = 300; // ms
const MAX_BUFFER_SIZE = 10000; // caractères

// 🆕 OPERATIONAL TRANSFORM SERVICE SIMPLIFIÉ
class OTService {
  static applyOperation(content, operation) {
    switch (operation.type) {
      case 'insert':
        return this.applyInsert(content, operation);
      case 'delete':
        return this.applyDelete(content, operation);
      case 'format':
        return this.applyFormat(content, operation);
      default:
        return content;
    }
  }
  
  static applyInsert(content, op) {
    const before = content.slice(0, op.position);
    const after = content.slice(op.position);
    return before + op.text + after;
  }
  
  static applyDelete(content, op) {
    const before = content.slice(0, op.position);
    const after = content.slice(op.position + op.length);
    return before + after;
  }
  
  static applyFormat(content, op) {
    // Formatage simple (ex: bold, italic)
    // À étendre selon les besoins
    return content;
  }
  
  static transformOperation(op1, op2) {
    // Transformation d'opérations concurrentes (OT simplifié)
    if (op1.type === 'insert' && op2.type === 'insert') {
      if (op1.position < op2.position) {
        return op1;
      } else if (op1.position > op2.position) {
        return { ...op1, position: op1.position + op2.text.length };
      }
    }
    // Logique complète OT à implémenter
    return op1;
  }
}

export const padController = {
  // 🎯 GET ou CREATE Pad avec cache
  getOrCreatePad: async (conversationId, userId, useCache = true) => {
    try {
      const cacheKey = `${conversationId}_${userId}`;
      
      // Vérifier le cache
      if (useCache && padCache.has(cacheKey)) {
        const cached = padCache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
          console.log(`📦 Pad chargé depuis cache: ${conversationId}`);
          return cached.pad;
        }
      }
      
      let pad = await Pad.findOne({ conversationId })
        .populate("lastUpdatedBy", "username profilePicture")
        .populate("completedItems.completedBy", "username")
        .populate("assignedItems.assignedTo", "username profilePicture")
        .populate("assignedItems.assignedBy", "username")
        .populate("operations.authorId", "username")
        .populate("accessLevels.userId", "username")
        .lean(); // Lean pour performance
      
      if (!pad) {
        // Vérifier que l'user a accès à la conversation
        const participant = await Participants.findOne({
          Id_Conversation: conversationId,
          Id_User: userId
        }).lean();

        if (!participant) {
          throw new Error("Accès non autorisé à cette conversation");
        }

        // 🆕 CRÉATION AVEC PRÉFÉRENCES UTILISATEUR
        const user = await User.findById(userId).select('preferences').lean();
        const defaultPrefs = user?.preferences?.pad || {
          theme: "auto",
          autoFormat: true,
          fontSize: 14
        };

        pad = new Pad({
          conversationId,
          content: "",
          mode: "text",
          preferences: defaultPrefs,
          lastUpdatedBy: userId,
          accessLevels: [{
            userId: userId,
            level: "admin"
          }]
        });
        await pad.save();
        
        // 🆕 APPLIQUER TEMPLATE SI DISPONIBLE
        const template = await Template.findOne({ 
          type: "meeting", 
          default: true 
        }).lean();
        
        if (template) {
          pad.content = template.content;
          pad.templateId = template._id;
          await pad.save();
        }
      }
      
      // Mettre en cache
      padCache.set(cacheKey, {
        pad: pad,
        timestamp: Date.now()
      });
      
      return pad;
    } catch (error) {
      console.error("❌ Erreur getOrCreatePad:", error);
      throw error;
    }
  },

  // 🎯 UPDATE Pad content avec buffer et OT
  updatePadContent: async (conversationId, userId, newContent, mode = "text", operation = null) => {
    try {
      // 🆕 VÉRIFIER LES PERMISSIONS GRANULAIRES
      const pad = await Pad.findOne({ conversationId }).lean();
      if (!pad) {
        throw new Error("Pad non trouvé");
      }
      
      // Vérifier si l'utilisateur peut éditer
      if (pad.accessLevels && pad.accessLevels.length > 0) {
        const userAccess = pad.accessLevels.find(a => 
          a.userId.toString() === userId.toString()
        );
        if (!userAccess || !["edit", "admin"].includes(userAccess.level)) {
          throw new Error("Vous n'avez pas la permission d'éditer ce pad");
        }
      }
      
      // 🆕 GESTION OPERATIONAL TRANSFORM
      let finalContent = newContent;
      let operationsToSave = [];
      
      if (operation) {
        // Appliquer l'opération avec OT
        finalContent = OTService.applyOperation(pad.content, operation);
        operationsToSave = [{
          ...operation,
          authorId: userId,
          clientId: operation.clientId || Date.now().toString(),
          timestamp: new Date()
        }];
      } else {
        // Mode legacy: calculer le diff
        const diff = this.calculateDiff(pad.content, newContent);
        if (diff) {
          operationsToSave = [{
            type: diff.type,
            position: diff.position,
            text: diff.text,
            length: diff.length,
            authorId: userId,
            clientId: `legacy_${Date.now()}`,
            timestamp: new Date()
          }];
        }
      }
      
      // 🆕 SAUVEGARDE AVEC VERSIONING
      const versionHistoryEntry = {
        content: pad.content,
        mode: pad.mode,
        operations: operationsToSave,
        version: pad.version || 0,
        updatedBy: pad.lastUpdatedBy || userId,
        updatedAt: new Date()
      };
      
      // Limiter l'historique
      const updatedPad = await Pad.findOneAndUpdate(
        { conversationId },
        {
          $set: {
            content: finalContent,
            mode: mode,
            lastUpdatedBy: userId,
            updatedAt: new Date(),
            version: (pad.version || 0) + 1
          },
          $push: {
            versionHistory: { $each: [versionHistoryEntry], $position: 0, $slice: 100 },
            operations: { $each: operationsToSave, $slice: -500 }
          },
          $inc: {
            "metrics.totalEdits": 1
          }
        },
        { new: true, upsert: false }
      ).populate("lastUpdatedBy", "username profilePicture")
       .populate("operations.authorId", "username");
      
      // 🆕 INVALIDER LE CACHE
      padCache.forEach((value, key) => {
        if (key.startsWith(conversationId)) {
          padCache.delete(key);
        }
      });
      
      // 🆕 DÉCLENCHER LES WEBHOOKS
      await this.triggerWebhooks(conversationId, "content_changed", {
        userId,
        version: updatedPad.version,
        operationCount: operationsToSave.length
      });
      
      return updatedPad;
    } catch (error) {
      console.error("❌ Erreur updatePadContent:", error);
      throw error;
    }
  },

  // 🎯 UPDATE BUFFERED - Pour WebSocket avec buffer
  updateBuffered: async (conversationId, userId, content, mode = "text") => {
    return new Promise((resolve, reject) => {
      const bufferKey = `${conversationId}_${userId}`;
      
      // Nettoyer l'ancien timeout
      if (updateBuffer.has(bufferKey)) {
        clearTimeout(updateBuffer.get(bufferKey).timeout);
      }
      
      // Créer/mettre à jour le buffer
      const bufferData = updateBuffer.get(bufferKey) || {
        content: "",
        mode: "text",
        pendingUpdates: 0
      };
      
      bufferData.content = content;
      bufferData.mode = mode;
      bufferData.pendingUpdates = (bufferData.pendingUpdates || 0) + 1;
      
      // Définir le timeout pour la sauvegarde batch
      bufferData.timeout = setTimeout(async () => {
        try {
          const { content: bufferedContent, mode: bufferedMode } = bufferData;
          updateBuffer.delete(bufferKey);
          
          // Sauvegarder le contenu bufferisé
          const savedPad = await padController.updatePadContent(
            conversationId,
            userId,
            bufferedContent,
            bufferedMode
          );
          
          resolve(savedPad);
        } catch (error) {
          reject(error);
        }
      }, BUFFER_DELAY);
      
      updateBuffer.set(bufferKey, bufferData);
      
      // Si le buffer devient trop grand, sauvegarder immédiatement
      if (bufferData.content.length > MAX_BUFFER_SIZE) {
        clearTimeout(bufferData.timeout);
        updateBuffer.delete(bufferKey);
        
        padController.updatePadContent(conversationId, userId, content, mode)
          .then(resolve)
          .catch(reject);
      }
    });
  },

  // 🎯 TOGGLE Todo Item avec analytics
  toggleTodoItem: async (conversationId, userId, lineIndex, completed, metadata = {}) => {
    try {
      const pad = await Pad.findOne({ conversationId });
      
      if (!pad) {
        throw new Error("Pad non trouvé");
      }
      
      // 🆕 VÉRIFIER SI L'ITEM EXISTE DANS LE CONTENU
      const lines = pad.content.split('\n');
      if (lineIndex >= lines.length) {
        throw new Error("Ligne non trouvée dans le pad");
      }
      
      // 🆕 METADATA COMPLÈTE
      const itemData = {
        lineIndex,
        completedAt: completed ? new Date() : null,
        completedBy: completed ? userId : null,
        dueDate: metadata.dueDate || null,
        priority: metadata.priority || "medium",
        tags: metadata.tags || [],
        estimatedTime: metadata.estimatedTime || null,
        subTasks: metadata.subTasks || []
      };
      
      // Retirer l'item existant
      pad.completedItems = pad.completedItems.filter(item => 
        item.lineIndex !== lineIndex
      );
      
      // Ajouter si completed
      if (completed) {
        pad.completedItems.push(itemData);
        
        // 🆕 METTRE À JOUR LES MÉTRIQUES
        pad.metrics.completionRate = pad.progress;
        
        // 🆕 DÉCLENCHER WEBHOOK
        await this.triggerWebhooks(conversationId, "item_completed", {
          userId,
          lineIndex,
          completedAt: new Date(),
          itemText: lines[lineIndex]
        });
      }
      
      await pad.save();
      
      // 🆕 INVALIDER LE CACHE
      padCache.forEach((value, key) => {
        if (key.startsWith(conversationId)) {
          padCache.delete(key);
        }
      });
      
      return await Pad.findById(pad._id)
        .populate("completedItems.completedBy", "username")
        .populate("lastUpdatedBy", "username profilePicture");
    } catch (error) {
      throw error;
    }
  },

  // 🎯 ASSIGN Item avec intelligence
  assignItem: async (conversationId, userId, lineIndex, assignToUserId, metadata = {}) => {
    try {
      const pad = await Pad.findOne({ conversationId });
      
      if (!pad) {
        throw new Error("Pad non trouvé");
      }
      
      // Vérifier que l'user assigné est dans la conversation
      const participant = await Participants.findOne({
        Id_Conversation: conversationId,
        Id_User: assignToUserId
      });
      
      if (!participant) {
        throw new Error("Utilisateur non présent dans la conversation");
      }
      
      // 🆕 RÉCUPÉRER LE TEXTE DE LA LIGNE
      const lines = pad.content.split('\n');
      const itemText = lines[lineIndex] || "";
      
      // 🆕 MÉTADONNÉES D'ASSIGNATION AVANCÉES
      const assignmentData = {
        lineIndex,
        assignedTo: assignToUserId,
        assignedBy: userId,
        assignedAt: new Date(),
        status: metadata.status || "pending",
        dueDate: metadata.dueDate || null,
        notify: metadata.notify !== false
      };
      
      // Retirer l'assignation existante
      pad.assignedItems = pad.assignedItems.filter(item => 
        item.lineIndex !== lineIndex
      );
      
      // Ajouter nouvelle assignation
      pad.assignedItems.push(assignmentData);
      
      // 🆕 AJOUTER AUX SUGGESTIONS FUTURES
      if (!pad.suggestedAssignments) {
        pad.suggestedAssignments = [];
      }
      
      // Mettre à jour la confiance pour cet utilisateur
      const existingSuggestion = pad.suggestedAssignments.find(
        s => s.userId.toString() === assignToUserId.toString()
      );
      
      if (existingSuggestion) {
        existingSuggestion.confidence = Math.min(existingSuggestion.confidence + 0.1, 1.0);
      } else {
        pad.suggestedAssignments.push({
          userId: assignToUserId,
          reason: `Assigné par ${userId} pour "${itemText.substring(0, 30)}..."`,
          confidence: 0.5
        });
      }
      
      await pad.save();
      
      // 🆕 DÉCLENCHER LES WEBHOOKS
      await this.triggerWebhooks(conversationId, "item_assigned", {
        assignedBy: userId,
        assignedTo: assignToUserId,
        lineIndex,
        itemText: itemText,
        dueDate: metadata.dueDate
      });
      
      // 🆕 ENVOYER NOTIFICATION PUSH
      await this.sendPushNotification(assignToUserId, {
        title: "Nouvelle tâche assignée",
        body: `Vous avez été assigné à: ${itemText.substring(0, 50)}...`,
        data: { conversationId, lineIndex }
      });
      
      return await Pad.findById(pad._id)
        .populate("assignedItems.assignedTo", "username profilePicture")
        .populate("assignedItems.assignedBy", "username")
        .populate("lastUpdatedBy", "username profilePicture")
        .populate("suggestedAssignments.userId", "username");
    } catch (error) {
      throw error;
    }
  },

  // 🎯 TOGGLE Mode avec formatage intelligent
  toggleMode: async (conversationId, userId, newMode) => {
    try {
      const pad = await Pad.findOne({ conversationId });
      
      if (!pad) {
        throw new Error("Pad non trouvé");
      }
      
      const oldMode = pad.mode;
      pad.mode = newMode;
      pad.lastUpdatedBy = userId;
      
      // 🆕 FORMATAGE INTELLIGENT SELON LE MODE
      if (oldMode === "text" && newMode === "todo") {
        pad.content = this.formatContentForTodo(pad.content);
        
        // 🆕 DÉTECTER LES TÂCHES DÉJÀ COMPLÉTÉES DANS LE TEXTE
        const lines = pad.content.split('\n');
        lines.forEach((line, index) => {
          if (line.includes("[x]") || line.includes("[X]") || line.includes("✅")) {
            if (!pad.completedItems.find(item => item.lineIndex === index)) {
              pad.completedItems.push({
                lineIndex: index,
                completedAt: new Date(),
                completedBy: userId
              });
            }
          }
        });
      } else if (oldMode === "todo" && newMode === "text") {
        pad.content = this.formatContentForText(pad.content);
      }
      
      await pad.save();
      
      // 🆕 DÉCLENCHER WEBHOOK
      await this.triggerWebhooks(conversationId, "mode_changed", {
        userId,
        oldMode,
        newMode
      });
      
      return pad;
    } catch (error) {
      throw error;
    }
  },

  // 🎯 CLEAR Pad (soft delete) avec backup
  clearPad: async (conversationId, userId, backup = true) => {
    try {
      const pad = await Pad.findOne({ conversationId });
      
      if (!pad) {
        throw new Error("Pad non trouvé");
      }
      
      // 🆕 SAUVEGARDER AVANT CLEAR
      if (backup) {
        pad.versionHistory.unshift({
          content: pad.content,
          mode: pad.mode,
          operations: pad.operations.slice(-10),
          version: pad.version,
          updatedBy: pad.lastUpdatedBy,
          updatedAt: new Date()
        });
        
        // 🆕 CRÉER UN SNAPSHOT POUR RESTAURATION
        await this.createBackupSnapshot(conversationId, pad.content);
      }
      
      // Clear le contenu mais garder la structure
      pad.content = "";
      pad.completedItems = [];
      pad.assignedItems = [];
      pad.lastUpdatedBy = userId;
      pad.version = 0;
      pad.operations = [];
      
      // 🆕 SAUVEGARDER LES MÉTRIQUES
      pad.metrics.lastActiveAt = new Date();
      
      await pad.save();
      
      // 🆕 INVALIDER TOUT LE CACHE
      padCache.clear();
      
      // 🆕 DÉCLENCHER WEBHOOK
      await this.triggerWebhooks(conversationId, "pad_cleared", {
        userId,
        backedUp: backup
      });
      
      return pad;
    } catch (error) {
      throw error;
    }
  },

  // 🎯 GET Progress Stats avec détails
  getProgressStats: (pad) => {
    if (pad.mode !== "todo") return null;
    
    const lines = pad.content.split('\n').filter(line => line.trim() !== '');
    const totalItems = lines.length;
    const completedItems = pad.completedItems.length;
    const assignedItems = pad.assignedItems.length;
    const overdueItems = pad.completedItems.filter(item => 
      item.dueDate && new Date(item.dueDate) < new Date() && !item.completedAt
    ).length;
    
    return {
      completed: completedItems,
      total: totalItems,
      assigned: assignedItems,
      overdue: overdueItems,
      progress: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
      completionRate: pad.metrics.completionRate || 0,
      avgCompletionTime: this.calculateAverageCompletionTime(pad)
    };
  },

  // 🆕 NOUVELLES FONCTIONNALITÉS
  
  // 🎯 RESTAURER VERSION
  restoreVersion: async (conversationId, userId, versionIndex) => {
    try {
      const pad = await Pad.findOne({ conversationId });
      
      if (!pad || !pad.versionHistory[versionIndex]) {
        throw new Error("Version non trouvée");
      }
      
      const version = pad.versionHistory[versionIndex];
      
      // Sauvegarder la version actuelle
      pad.versionHistory.unshift({
        content: pad.content,
        mode: pad.mode,
        operations: pad.operations.slice(-10),
        version: pad.version,
        updatedBy: pad.lastUpdatedBy,
        updatedAt: new Date()
      });
      
      // Restaurer
      pad.content = version.content;
      pad.mode = version.mode;
      pad.lastUpdatedBy = userId;
      pad.version = version.version;
      pad.updatedAt = new Date();
      
      await pad.save();
      
      // Invalider cache
      padCache.forEach((value, key) => {
        if (key.startsWith(conversationId)) {
          padCache.delete(key);
        }
      });
      
      return pad;
    } catch (error) {
      throw error;
    }
  },

  // 🎯 CHANGER PREFERENCES
  updatePreferences: async (conversationId, userId, preferences) => {
    try {
      const pad = await Pad.findOne({ conversationId });
      
      if (!pad) {
        throw new Error("Pad non trouvé");
      }
      
      // Vérifier les permissions
      if (pad.accessLevels && pad.accessLevels.length > 0) {
        const userAccess = pad.accessLevels.find(a => 
          a.userId.toString() === userId.toString()
        );
        if (!userAccess || !["edit", "admin"].includes(userAccess.level)) {
          throw new Error("Permission insuffisante pour modifier les préférences");
        }
      }
      
      // Mettre à jour les préférences
      pad.preferences = {
        ...pad.preferences,
        ...preferences
      };
      
      await pad.save();
      return pad;
    } catch (error) {
      throw error;
    }
  },

  // 🎯 GÉRER LES PERMISSIONS
  updateAccessLevel: async (conversationId, adminUserId, targetUserId, level) => {
    try {
      // Vérifier que l'admin a les droits
      const pad = await Pad.findOne({ conversationId });
      
      if (!pad) {
        throw new Error("Pad non trouvé");
      }
      
      const adminAccess = pad.accessLevels.find(a => 
        a.userId.toString() === adminUserId.toString()
      );
      
      if (!adminAccess || adminAccess.level !== "admin") {
        throw new Error("Permission admin requise");
      }
      
      // Mettre à jour/créer l'accès
      const existingIndex = pad.accessLevels.findIndex(a => 
        a.userId.toString() === targetUserId.toString()
      );
      
      if (existingIndex >= 0) {
        pad.accessLevels[existingIndex].level = level;
      } else {
        pad.accessLevels.push({
          userId: targetUserId,
          level: level
        });
      }
      
      await pad.save();
      return pad;
    } catch (error) {
      throw error;
    }
  },

  // 🎯 GET SUGGESTIONS INTELLIGENTES
  getSuggestions: async (conversationId, userId) => {
    try {
      const pad = await Pad.findOne({ conversationId })
        .populate("suggestedAssignments.userId", "username profilePicture");
      
      if (!pad) {
        throw new Error("Pad non trouvé");
      }
      
      const suggestions = pad.getContextSuggestions();
      
      // Ajouter les suggestions d'assignation
      if (pad.suggestedAssignments && pad.suggestedAssignments.length > 0) {
        suggestions.push({
          type: "assignment_suggestions",
          confidence: 0.7,
          message: "Suggestions d'assignation basées sur l'historique",
          data: pad.suggestedAssignments.filter(s => s.confidence > 0.6)
        });
      }
      
      // Analyser le contenu pour plus de suggestions
      const contentAnalysis = this.analyzeContent(pad.content);
      if (contentAnalysis) {
        suggestions.push(contentAnalysis);
      }
      
      return suggestions;
    } catch (error) {
      throw error;
    }
  },

  // 🎯 GÉNÉRER RAPPORT
  generateReport: async (conversationId, userId) => {
    try {
      const pad = await Pad.findOne({ conversationId })
        .populate("lastUpdatedBy", "username")
        .populate("versionHistory.updatedBy", "username")
        .populate("operations.authorId", "username");
      
      if (!pad) {
        throw new Error("Pad non trouvé");
      }
      
      // Vérifier l'accès
      if (pad.accessLevels && pad.accessLevels.length > 0) {
        const userAccess = pad.accessLevels.find(a => 
          a.userId.toString() === userId.toString()
        );
        if (!userAccess || userAccess.level === "read") {
          throw new Error("Permission insuffisante pour générer un rapport");
        }
      }
      
      return pad.generateReport();
    } catch (error) {
      throw error;
    }
  },

  // 🎯 APPLIQUER TEMPLATE
  applyTemplate: async (conversationId, userId, templateId) => {
    try {
      const pad = await Pad.findOne({ conversationId });
      const template = await Template.findById(templateId);
      
      if (!pad || !template) {
        throw new Error("Pad ou template non trouvé");
      }
      
      // Vérifier les permissions
      if (pad.accessLevels && pad.accessLevels.length > 0) {
        const userAccess = pad.accessLevels.find(a => 
          a.userId.toString() === userId.toString()
        );
        if (!userAccess || !["edit", "admin"].includes(userAccess.level)) {
          throw new Error("Permission insuffisante pour appliquer un template");
        }
      }
      
      // Sauvegarder l'ancien contenu
      pad.versionHistory.unshift({
        content: pad.content,
        mode: pad.mode,
        version: pad.version,
        updatedBy: pad.lastUpdatedBy,
        updatedAt: new Date()
      });
      
      // Appliquer le template
      pad.content = template.content;
      pad.mode = template.defaultMode || "text";
      pad.templateId = templateId;
      pad.lastUpdatedBy = userId;
      pad.version += 1;
      
      // Appliquer les préférences du template si définies
      if (template.preferences) {
        pad.preferences = {
          ...pad.preferences,
          ...template.preferences
        };
      }
      
      await pad.save();
      return pad;
    } catch (error) {
      throw error;
    }
  },

  // 🎯 FORMAT Content for Todo Mode
  formatContentForTodo: (content) => {
    const lines = content.split('\n');
    return lines.map(line => {
      if (line.trim() === '') return line;
      
      // Déjà formaté ?
      if (!line.match(/^[☐✔☑□✓■▢] /) && !line.match(/^\[[ xX]?\]/)) {
        // Détecter si c'est déjà une tâche complétée
        if (line.includes("[x]") || line.includes("[X]") || line.includes("✅")) {
          return `✔ ${line.replace(/^\[[xX]\]\s*/, '').replace(/^✅\s*/, '')}`;
        }
        return `☐ ${line}`;
      }
      return line;
    }).join('\n');
  },

  // 🎯 FORMAT Content for Text Mode
  formatContentForText: (content) => {
    const lines = content.split('\n');
    return lines.map(line => {
      // Retirer les préfixes de checkbox
      return line.replace(/^[☐✔☑□✓■▢] /, '').replace(/^\[[ xX]?\] /, '');
    }).join('\n');
  },

  // 🆕 HELPERS INTERNES
  
  // Calculer la différence entre deux contenus
  calculateDiff: (oldContent, newContent) => {
    if (oldContent === newContent) return null;
    
    // Trouver la première position différente
    let position = 0;
    while (oldContent[position] === newContent[position] && 
           position < Math.min(oldContent.length, newContent.length)) {
      position++;
    }
    
    // Si newContent est plus long = insertion
    if (newContent.length > oldContent.length) {
      return {
        type: "insert",
        position: position,
        text: newContent.substring(position, position + (newContent.length - oldContent.length)),
        length: newContent.length - oldContent.length
      };
    }
    // Si oldContent est plus long = suppression
    else if (oldContent.length > newContent.length) {
      return {
        type: "delete",
        position: position,
        length: oldContent.length - newContent.length
      };
    }
    // Même longueur = remplacement
    else {
      return {
        type: "replace",
        position: position,
        text: newContent.substring(position),
        length: oldContent.length - position
      };
    }
  },
  
  // Calculer le temps moyen de complétion
  calculateAverageCompletionTime: (pad) => {
    const completedItems = pad.completedItems.filter(item => 
      item.completedAt && item.dueDate
    );
    
    if (completedItems.length === 0) return null;
    
    const totalTime = completedItems.reduce((sum, item) => {
      const completionTime = item.completedAt - item.dueDate;
      return sum + (completionTime > 0 ? completionTime : 0);
    }, 0);
    
    return Math.round(totalTime / completedItems.length / (1000 * 60)); // en minutes
  },
  
  // Analyser le contenu pour suggestions
  analyzeContent: (content) => {
    if (!content || content.length < 10) return null;
    
    const lines = content.split('\n');
    const words = content.split(/\s+/);
    
    // Détecter les listes
    const listItems = lines.filter(line => 
      line.match(/^\d+\.|\-\s+|\*\s+/) || 
      line.includes("[ ]") || line.includes("[x]") || 
      line.includes("☐") || line.includes("✔")
    );
    
    if (listItems.length >= 3) {
      return {
        type: "detected_list",
        confidence: 0.8,
        message: `Détecté ${listItems.length} éléments de liste. Passer en mode todo?`,
        data: { listItemCount: listItems.length }
      };
    }
    
    // Détecter les questions
    const questions = lines.filter(line => line.trim().endsWith('?'));
    if (questions.length >= 2) {
      return {
        type: "detected_questions",
        confidence: 0.6,
        message: `${questions.length} questions détectées. Créer un FAQ?`,
        data: { questions: questions.slice(0, 3) }
      };
    }
    
    return null;
  },
  
  // Déclencher les webhooks
  triggerWebhooks: async (conversationId, event, data) => {
    try {
      const pad = await Pad.findOne({ conversationId }).select('webhooks').lean();
      
      if (!pad || !pad.webhooks || pad.webhooks.length === 0) {
        return;
      }
      
      const activeWebhooks = pad.webhooks.filter(h => 
        h.active && h.events.includes(event)
      );
      
      // Envoi asynchrone (non bloquant)
      activeWebhooks.forEach(async (webhook) => {
        try {
          const response = await fetch(webhook.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Pad-Event': event,
              'X-Conversation-Id': conversationId
            },
            body: JSON.stringify({
              event,
              conversationId,
              timestamp: new Date().toISOString(),
              data
            })
          });
          
          // Mettre à jour lastTriggered
          await Pad.updateOne(
            { conversationId, "webhooks.url": webhook.url },
            { $set: { "webhooks.$.lastTriggered": new Date() } }
          );
          
          console.log(`✅ Webhook ${event} déclenché pour ${conversationId}`);
        } catch (error) {
          console.error(`❌ Erreur webhook ${webhook.url}:`, error);
        }
      });
    } catch (error) {
      console.error("❌ Erreur triggerWebhooks:", error);
    }
  },
  
  // Envoyer notification push (simplifié)
  sendPushNotification: async (userId, notification) => {
    // Implémentation simplifiée
    // À remplacer par Firebase Cloud Messaging, OneSignal, etc.
    console.log(`📱 Notification push pour ${userId}:`, notification);
    
    // Simuler l'envoi
    return new Promise(resolve => {
      setTimeout(() => {
        console.log(`✅ Notification envoyée à ${userId}`);
        resolve(true);
      }, 100);
    });
  },
  
  // Créer un backup snapshot
  createBackupSnapshot: async (conversationId, content) => {
    try {
      // Implémentation simplifiée
      // À étendre avec stockage S3, etc.
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupKey = `backup_${conversationId}_${timestamp}.txt`;
      
      console.log(`💾 Backup créé: ${backupKey} (${content.length} caractères)`);
      return backupKey;
    } catch (error) {
      console.error("❌ Erreur backup:", error);
      return null;
    }
  },
  
  // 🆕 NETTOYAGE DU CACHE PERIODIQUE
  cleanupCache: () => {
    const now = Date.now();
    let cleared = 0;
    
    padCache.forEach((value, key) => {
      if (now - value.timestamp > CACHE_TTL) {
        padCache.delete(key);
        cleared++;
      }
    });
    
    if (cleared > 0) {
      console.log(`🧹 Cache nettoyé: ${cleared} entrées expirées`);
    }
  },
  
  // 🆕 STATISTIQUES SYSTÈME
  getSystemStats: () => {
    return {
      cacheSize: padCache.size,
      bufferSize: updateBuffer.size,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };
  }
};

// 🆕 NETTOYAGE AUTOMATIQUE DU CACHE (toutes les 10 minutes)
setInterval(() => {
  padController.cleanupCache();
}, 10 * 60 * 1000);
// server/routes/notificationRoutes.js
import express from 'express';
import {
  createNotification,
  createOrderNotifications,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  cleanupOldNotifications
} from '../services/notificationService.js';

const router = express.Router();

/**
 * GET /api/notifications
 * Get all notifications (all stores)
 */
router.get('/', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    
    // Get all notifications across all stores
    const notifications = getNotifications(null, limit);
    
    // Get total unread count across all stores
    const unreadCount = getUnreadCount(null);
    
    console.log(`[Notifications] Fetched ${notifications.length} notifications, ${unreadCount} unread`);
    
    res.json({
      success: true,
      notifications,
      unreadCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Notifications] Error fetching notifications:', error);
    res.status(500).json({
      error: 'Failed to fetch notifications',
      message: error.message
    });
  }
});

/**
 * GET /api/notifications/unread-count
 * Get unread count (all stores)
 */
router.get('/unread-count', (req, res) => {
  try {
    const unreadCount = getUnreadCount(null);
    
    res.json({
      success: true,
      unreadCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Notifications] Error getting unread count:', error);
    res.status(500).json({
      error: 'Failed to get unread count',
      message: error.message
    });
  }
});

/**
 * POST /api/notifications/:id/read
 * Mark a single notification as read
 */
router.post('/:id/read', (req, res) => {
  try {
    const notificationId = parseInt(req.params.id, 10);
    
    if (!notificationId || isNaN(notificationId)) {
      return res.status(400).json({
        error: 'Invalid notification ID',
        message: 'ID must be a valid number'
      });
    }
    
    markAsRead(notificationId);
    
    console.log(`[Notifications] Marked notification ${notificationId} as read`);
    
    res.json({
      success: true,
      message: `Notification ${notificationId} marked as read`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Notifications] Error marking as read:', error);
    res.status(500).json({
      error: 'Failed to mark notification as read',
      message: error.message
    });
  }
});

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read (all stores)
 */
router.post('/read-all', (req, res) => {
  try {
    markAllAsRead(null);  // null = all stores
    
    const unreadCount = getUnreadCount(null);
    
    console.log('[Notifications] Marked all notifications as read');
    
    res.json({
      success: true,
      message: 'All notifications marked as read',
      unreadCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Notifications] Error marking all as read:', error);
    res.status(500).json({
      error: 'Failed to mark all notifications as read',
      message: error.message
    });
  }
});

/**
 * POST /api/notifications
 * Create a new notification (internal use by syncing services)
 */
router.post('/', (req, res) => {
  try {
    const { store, type, message, metadata } = req.body;
    
    if (!store || !type || !message) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'store, type, and message are required'
      });
    }
    
    const notificationId = createNotification({
      store,
      type,
      message,
      metadata: metadata || {}
    });
    
    console.log(`[Notifications] Created notification: ${notificationId}`);
    
    res.json({
      success: true,
      notificationId,
      message: 'Notification created',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Notifications] Error creating notification:', error);
    res.status(500).json({
      error: 'Failed to create notification',
      message: error.message
    });
  }
});

/**
 * POST /api/notifications/orders
 * Create notifications from synced orders (used by sync services)
 */
router.post('/orders', (req, res) => {
  try {
    const { store, source, orders } = req.body;
    
    if (!store || !source || !Array.isArray(orders)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'store, source, and orders array are required'
      });
    }
    
    const created = createOrderNotifications(store, source, orders);
    
    console.log(`[Notifications] Created ${created} order notifications for ${store} from ${source}`);
    
    res.json({
      success: true,
      created,
      message: `Created ${created} notification(s)`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Notifications] Error creating order notifications:', error);
    res.status(500).json({
      error: 'Failed to create order notifications',
      message: error.message
    });
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete a notification (optional)
 */
router.delete('/:id', (req, res) => {
  try {
    const notificationId = parseInt(req.params.id, 10);
    
    if (!notificationId || isNaN(notificationId)) {
      return res.status(400).json({
        error: 'Invalid notification ID',
        message: 'ID must be a valid number'
      });
    }
    
    const db = require('../db/database.js').getDb();
    const result = db.prepare('DELETE FROM notifications WHERE id = ?').run(notificationId);
    
    console.log(`[Notifications] Deleted notification ${notificationId}`);
    
    res.json({
      success: true,
      message: `Notification ${notificationId} deleted`,
      deleted: result.changes > 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Notifications] Error deleting notification:', error);
    res.status(500).json({
      error: 'Failed to delete notification',
      message: error.message
    });
  }
});

/**
 * POST /api/notifications/cleanup
 * Clean up old notifications (older than 7 days)
 * Called periodically by cron or admin
 */
router.post('/cleanup', (req, res) => {
  try {
    const deleted = cleanupOldNotifications();
    
    console.log(`[Notifications] Cleanup completed: ${deleted} old notifications deleted`);
    
    res.json({
      success: true,
      message: 'Old notifications cleaned up',
      deleted,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Notifications] Error cleaning up:', error);
    res.status(500).json({
      error: 'Failed to cleanup notifications',
      message: error.message
    });
  }
});

export default router;

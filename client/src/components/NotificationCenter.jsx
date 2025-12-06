import { useState, useEffect, useRef } from 'react';
import { Bell, Check, Volume2, VolumeX, Trash2 } from 'lucide-react';

export default function NotificationCenter({ currentStore }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastNotificationId, setLastNotificationId] = useState(null);
  const dropdownRef = useRef(null);
  const audioRef = useRef(null);

  // Load sound preference from localStorage
  useEffect(() => {
    const savedPref = localStorage.getItem('notificationSoundEnabled');
    if (savedPref !== null) {
      setSoundEnabled(JSON.parse(savedPref));
    }
  }, []);

  // Save sound preference
  const toggleSound = () => {
    const newValue = !soundEnabled;
    setSoundEnabled(newValue);
    localStorage.setItem('notificationSoundEnabled', JSON.stringify(newValue));
  };

  // Play notification sound
  const playSound = () => {
    if (soundEnabled && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.volume = 0.5;
      audioRef.current.play().catch(err => console.log('Audio play failed:', err));
    }
  };

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      const response = await fetch('/api/notifications');
      const data = await response.json();
      
      if (data.success) {
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
        
        // Check for new notifications and play sound
        if (data.notifications.length > 0) {
          const latestId = data.notifications[0].id;
          
          if (lastNotificationId && latestId > lastNotificationId) {
            // New notification detected!
            playSound();
            
            // Show browser notification if permission granted
            if (Notification.permission === 'granted') {
              const latest = data.notifications[0];
              new Notification('New Order! 🎉', {
                body: latest.message,
                icon: '/favicon.ico',
                tag: `order-${latestId}`
              });
            }
          }
          
          setLastNotificationId(latestId);
        }
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  };

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Poll for new notifications every 30 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [lastNotificationId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Mark notification as read
  const markAsRead = async (id) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
      fetchNotifications();
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    try {
      await fetch('/api/notifications/read-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      fetchNotifications();
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  // Get time ago string
  const getTimeAgo = (timestamp) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  // Get source icon and color
  const getSourceBadge = (source, store) => {
    const badges = {
      shopify: { label: 'Shopify', color: 'bg-green-100 text-green-700' },
      salla: { label: 'Salla', color: 'bg-green-100 text-green-700' },
      meta: { label: 'Meta', color: 'bg-yellow-100 text-yellow-700' },
      manual: { label: 'Manual', color: 'bg-blue-100 text-blue-700' }
    };
    
    const badge = badges[source] || { label: source, color: 'bg-gray-100 text-gray-700' };
    
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge.color}`}>
        {badge.label}
      </span>
    );
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Hidden audio element */}
      <audio ref={audioRef} src="/sounds/ch-ching.mp3" preload="auto" />
      
      {/* Bell Icon */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 max-h-[600px] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Notifications
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleSound}
                  className="p-1.5 hover:bg-white rounded-lg transition-colors"
                  title={soundEnabled ? 'Mute notifications' : 'Unmute notifications'}
                >
                  {soundEnabled ? (
                    <Volume2 className="w-4 h-4 text-indigo-600" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              </div>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                Mark all as read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Bell className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm">No notifications yet</p>
                <p className="text-xs mt-1">We'll notify you when orders come in</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notifications.map((notification) => {
                  const isCrossStore = notification.store !== currentStore;
                  
                  return (
                    <div
                      key={notification.id}
                      className={`p-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                        !notification.is_read ? 'bg-indigo-50/50' : ''
                      } ${isCrossStore ? 'border-l-4 border-l-purple-500' : ''}`}
                      onClick={() => !notification.is_read && markAsRead(notification.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-2xl">
                          {notification.type === 'order' ? '🛍️' : '📊'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {getSourceBadge(notification.source, notification.store)}
                            <span className="text-xs font-medium text-gray-900 uppercase">
                              {notification.store}
                            </span>
                            {isCrossStore && (
                              <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">
                                Other Store
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-900 font-medium">
                            {notification.message}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {getTimeAgo(notification.timestamp)}
                          </p>
                        </div>
                        {!notification.is_read && (
                          <div className="w-2 h-2 bg-indigo-500 rounded-full flex-shrink-0 mt-1"></div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


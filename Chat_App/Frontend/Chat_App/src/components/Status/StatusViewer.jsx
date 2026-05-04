import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Play, Pause, Volume2, VolumeX, Loader2, Heart } from 'lucide-react';

/**
 * StatusViewer Component
 * A high-performance, WhatsApp-style story viewer with segmented progress,
 * gesture support, and smooth Framer Motion transitions.
 */
const StatusViewer = ({ 
  user, 
  users, 
  activeUser, 
  onClose, 
  resolveAssetUrl,
  onLike,
  onView 
}) => {
  const [currentUserIndex, setCurrentUserIndex] = useState(0);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const progressTimerRef = useRef(null);
  const videoRef = useRef(null);

  // Filter users who actually have statuses
  const statusUsers = users.filter(u => u.statuses && u.statuses.length > 0);
  
  // Find initial user index if activeUser is provided
  useEffect(() => {
    if (activeUser) {
      const idx = statusUsers.findIndex(u => u.email === activeUser.email);
      if (idx !== -1) {
        setCurrentUserIndex(idx);
        setCurrentStoryIndex(0);
        setProgress(0);
      }
    }
  }, [activeUser]);

  const currentUser = statusUsers[currentUserIndex];
  const currentStory = currentUser?.statuses[currentStoryIndex];

  // Advance logic
  const handleNext = useCallback(() => {
    if (currentStoryIndex < (currentUser?.statuses.length || 0) - 1) {
      setCurrentStoryIndex(prev => prev + 1);
      setProgress(0);
      setIsLoading(true);
    } else if (currentUserIndex < statusUsers.length - 1) {
      setCurrentUserIndex(prev => prev + 1);
      setCurrentStoryIndex(0);
      setProgress(0);
      setIsLoading(true);
    } else {
      onClose();
    }
  }, [currentStoryIndex, currentUserIndex, statusUsers.length, currentUser?.statuses.length, onClose]);

  const handlePrev = useCallback(() => {
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex(prev => prev - 1);
      setProgress(0);
      setIsLoading(true);
    } else if (currentUserIndex > 0) {
      const prevUser = statusUsers[currentUserIndex - 1];
      setCurrentUserIndex(prev => prev - 1);
      setCurrentStoryIndex(prevUser.statuses.length - 1);
      setProgress(0);
      setIsLoading(true);
    }
  }, [currentStoryIndex, currentUserIndex, statusUsers]);

  // Progress animation
  useEffect(() => {
    if (isPaused || isLoading) return;

    const duration = currentStory?.mediaType === 'video' ? (videoRef.current?.duration || 10) * 1000 : 5000;
    const interval = 30; // 33fps
    const increment = (interval / duration) * 100;

    progressTimerRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressTimerRef.current);
          handleNext();
          return 0;
        }
        return prev + increment;
      });
    }, interval);

    return () => clearInterval(progressTimerRef.current);
  }, [isPaused, isLoading, currentStory, handleNext]);

  // View tracking
  useEffect(() => {
    if (currentUser && currentStory && currentUser.email !== user?.email) {
      onView(currentUser.email, currentStory._id);
    }
  }, [currentUser?.email, currentStory?._id, user?.email, onView]);

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') setIsPaused(p => !p);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, onClose]);

  if (!currentUser || !currentStory) return null;

  return (
    <motion.div 
      className="status-v3-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="status-v3-container" onClick={e => e.stopPropagation()}>
        
        {/* Progress Bars */}
        <div className="status-v3-progress-wrap">
          {currentUser.statuses.map((s, idx) => (
            <div key={idx} className="status-v3-progress-bg">
              <motion.div 
                className="status-v3-progress-fill"
                initial={{ width: 0 }}
                animate={{ 
                  width: idx < currentStoryIndex ? '100%' : idx === currentStoryIndex ? `${progress}%` : '0%' 
                }}
                transition={{ duration: 0.05, ease: 'linear' }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="status-v3-header">
          <div className="status-v3-user-info">
            <img src={resolveAssetUrl(currentUser.photo)} alt="" className="status-v3-avatar" />
            <div className="status-v3-meta">
              <span className="status-v3-name">{currentUser.name}</span>
              <span className="status-v3-time">
                {new Date(currentStory.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
          <div className="status-v3-actions">
            <button onClick={() => setIsPaused(!isPaused)} className="status-v3-icon-btn">
              {isPaused ? <Play size={20} fill="currentColor" /> : <Pause size={20} fill="currentColor" />}
            </button>
            <button onClick={() => setIsMuted(!isMuted)} className="status-v3-icon-btn">
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <button onClick={onClose} className="status-v3-icon-btn close">
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="status-v3-media-box">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${currentUser.email}-${currentStoryIndex}`}
              initial={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
              className="status-v3-media-content"
              onMouseDown={() => setIsPaused(true)}
              onMouseUp={() => setIsPaused(false)}
              onTouchStart={() => setIsPaused(true)}
              onTouchEnd={() => setIsPaused(false)}
            >
              {/* Blurred Background */}
              <div 
                className="status-v3-bg-blur" 
                style={{ backgroundImage: `url(${resolveAssetUrl(currentStory.mediaUrl)})` }} 
              />
              
              {currentStory.mediaType === 'video' ? (
                <video
                  ref={videoRef}
                  src={resolveAssetUrl(currentStory.mediaUrl)}
                  autoPlay
                  muted={isMuted}
                  onLoadStart={() => setIsLoading(true)}
                  onCanPlay={() => setIsLoading(false)}
                  onWaiting={() => setIsLoading(true)}
                  onPlaying={() => setIsLoading(false)}
                  className="status-v3-main-media"
                />
              ) : (
                <img
                  src={resolveAssetUrl(currentStory.mediaUrl)}
                  alt=""
                  onLoad={() => setIsLoading(false)}
                  className="status-v3-main-media"
                />
              )}

              {isLoading && (
                <div className="status-v3-loader">
                  <Loader2 className="animate-spin text-white opacity-80" size={48} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Navigation Zones */}
          <div className="status-v3-nav-layer">
            <div className="status-v3-nav-hit left" onClick={handlePrev} />
            <div className="status-v3-nav-hit right" onClick={handleNext} />
          </div>
        </div>

        {/* Footer / Caption */}
        {currentStory.text && (
          <motion.div 
            className="status-v3-caption-bar"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <p>{currentStory.text}</p>
          </motion.div>
        )}

        {/* Interaction Footer */}
        <div className="status-v3-footer">
          <button 
            className={`status-v3-like-btn ${currentStory.likes?.includes(user?.email) ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); onLike(currentUser.email, currentStory._id); }}
          >
            <Heart size={24} fill={currentStory.likes?.includes(user?.email) ? "currentColor" : "none"} />
            {currentStory.likes?.length > 0 && <span>{currentStory.likes.length}</span>}
          </button>
          <div className="status-v3-reply-mock">
            <span>Reply...</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default StatusViewer;

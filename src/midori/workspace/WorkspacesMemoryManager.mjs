/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */

/**
 * @description Memory management utilities for the Workspaces component
 * @module WorkspacesMemoryManager
 */

export const EXPORTED_SYMBOLS = ['WorkspacesMemoryManager'];

export const WorkspacesMemoryManager = {
  _isEnabled: false,
  _memoryThreshold: 50 * 1024 * 1024, // 50MB threshold
  _monitoringInterval: null,
  _lastCleanupTime: 0,
  _cleanupCooldown: 30000, // 30 seconds between cleanups

  /**
   * Initialize the memory manager
   */
  init() {
    try {
      this._isEnabled = true;
      this._startMemoryMonitoring();
      console.log('WorkspacesMemoryManager: Initialized successfully');
    } catch (error) {
      console.error('WorkspacesMemoryManager: Error initializing:', error);
    }
  },

  /**
   * Start memory monitoring
   */
  _startMemoryMonitoring() {
    // Monitor memory usage every 30 seconds
    this._monitoringInterval = setInterval(() => {
      if (this._isEnabled) {
        this.checkMemoryUsage();
      }
    }, 30000);
  },

  /**
   * Stop memory monitoring
   */
  _stopMemoryMonitoring() {
    if (this._monitoringInterval) {
      clearInterval(this._monitoringInterval);
      this._monitoringInterval = null;
    }
  },

  /**
   * Check current memory usage and take action if needed
   */
  checkMemoryUsage() {
    try {
      if (performance && performance.memory) {
        const usedMemory = performance.memory.usedJSHeapSize;
        const currentTime = Date.now();

        // Only cleanup if enough time has passed since last cleanup
        if (
          usedMemory > this._memoryThreshold &&
          currentTime - this._lastCleanupTime > this._cleanupCooldown
        ) {
          console.warn(
            `Workspaces: High memory usage detected (${Math.round(usedMemory / 1024 / 1024)}MB)`
          );
          this.optimizeMemory();
          this._lastCleanupTime = currentTime;
        }
      }
    } catch (error) {
      console.error('WorkspacesMemoryManager: Error checking memory usage:', error);
    }
  },

  /**
   * Optimize memory usage by cleaning up unnecessary resources
   */
  optimizeMemory() {
    try {
      // Force garbage collection if available
      if (window.gc) {
        window.gc();
      }

      // Clear any cached data
      this.clearCachedData();

      // Clear DOM references that might be holding memory
      this.clearDOMReferences();

      console.log('WorkspacesMemoryManager: Memory optimization completed');
    } catch (error) {
      console.error('WorkspacesMemoryManager: Error optimizing memory:', error);
    }
  },

  /**
   * Clear cached data to free memory
   */
  clearCachedData() {
    try {
      // Clear any stored references that might be holding memory
      if (window.gWorkspaces) {
        // Clear any cached workspace data
        if (window.gWorkspaces._cachedWorkspacesData) {
          window.gWorkspaces._cachedWorkspacesData = null;
        }

        // Clear any cached DOM queries
        if (window.gWorkspaces._cachedElements) {
          window.gWorkspaces._cachedElements = null;
        }
      }
    } catch (error) {
      console.error('WorkspacesMemoryManager: Error clearing cached data:', error);
    }
  },

  /**
   * Clear DOM references that might be holding memory
   */
  clearDOMReferences() {
    try {
      // Clear any stale DOM references
      const staleElements = document.querySelectorAll('.workspaceButton[data-stale="true"]');
      staleElements.forEach((element) => {
        element.remove();
      });
    } catch (error) {
      console.error('WorkspacesMemoryManager: Error clearing DOM references:', error);
    }
  },

  /**
   * Disable the memory manager and cleanup resources
   */
  disable() {
    try {
      this._isEnabled = false;
      this._stopMemoryMonitoring();
      this.clearCachedData();
      this.clearDOMReferences();
      console.log('WorkspacesMemoryManager: Disabled');
    } catch (error) {
      console.error('WorkspacesMemoryManager: Error disabling:', error);
    }
  },

  /**
   * Enable the memory manager
   */
  enable() {
    try {
      this._isEnabled = true;
      this._startMemoryMonitoring();
      console.log('WorkspacesMemoryManager: Enabled');
    } catch (error) {
      console.error('WorkspacesMemoryManager: Error enabling:', error);
    }
  },

  /**
   * Get memory usage statistics
   * @returns {Object|null} Memory usage information
   */
  getMemoryStats() {
    try {
      if (performance && performance.memory) {
        return {
          used: performance.memory.usedJSHeapSize,
          total: performance.memory.totalJSHeapSize,
          limit: performance.memory.jsHeapSizeLimit,
          usedMB: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
          totalMB: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
          limitMB: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024),
          percentage: Math.round(
            (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100
          ),
        };
      }
      return null;
    } catch (error) {
      console.error('WorkspacesMemoryManager: Error getting memory stats:', error);
      return null;
    }
  },

  /**
   * Set memory threshold
   * @param {number} threshold - Memory threshold in bytes
   */
  setMemoryThreshold(threshold) {
    this._memoryThreshold = threshold;
  },

  /**
   * Get current memory threshold
   * @returns {number} Current memory threshold in bytes
   */
  getMemoryThreshold() {
    return this._memoryThreshold;
  },
};

import { logger } from '@elizaos/core';
import { HyperfyService } from '../../plugin-hyperfy/service';
import { AgentControls } from '../../plugin-hyperfy/systems/controls';

export interface GasStationTask {
  id: string;
  name: string;
  locationName: string;
  description: string;
  frequency: 'constant' | 'periodic' | 'rare';
  priority: number;
  lastChecked: number;
  status: 'idle' | 'in_progress' | 'completed' | 'needs_attention';
  assignedTo: 'cleetus' | 'player' | null;
  position?: { x: number; z: number };
  entityId?: string;
}

export class GasStationTaskManager {
  private service: HyperfyService;
  private tasks: Map<string, GasStationTask> = new Map();
  private isCleetusBusy: boolean = false;

  // Known gas station locations
  private readonly STATION_LOCATIONS = {
    cashier: { entityId: 'Place🌀Cashier', name: 'Cash Register', priority: 1, pos: { x: 15, z: 8 } },
    pump1: { entityId: 'GaStationPump', name: 'Gas Pump 1', priority: 2, pos: { x: 20, z: 12 } },
    pump2: { entityId: 'GaStationPump-2', name: 'Gas Pump 2', priority: 2, pos: { x: 25, z: 12 } },
    stock: { entityId: 'UnpackedStock', name: 'Store Supplies', priority: 3, pos: { x: 10, z: 5 } },
    mainDoor: { entityId: 'GaSMainDoor', name: 'Main Entrance', priority: 4, pos: { x: 5, z: 8 } },
    toilet: { entityId: 'Toilet', name: 'Bathroom', priority: 5, pos: { x: 8, z: 3 } },
  };

  constructor(service: HyperfyService) {
    this.service = service;
    this.initializeTasks();
  }

  private initializeTasks() {
    const now = Date.now();

    // Cashier tasks
    this.tasks.set('check-register', {
      id: 'check-register',
      name: 'Check cash register',
      locationName: this.STATION_LOCATIONS.cashier.name,
      description: 'Count the money, check for discrepancies',
      frequency: 'periodic',
      priority: 1,
      lastChecked: now - 3600000, // 1 hour ago
      status: 'needs_attention',
      assignedTo: null,
      position: this.STATION_LOCATIONS.cashier.pos,
      entityId: this.STATION_LOCATIONS.cashier.entityId,
    });

    // Pump tasks
    this.tasks.set('check-pump1', {
      id: 'check-pump1',
      name: 'Check gas pump 1',
      locationName: this.STATION_LOCATIONS.pump1.name,
      description: 'Check fuel levels, clean nozzles, check for spills',
      frequency: 'constant',
      priority: 2,
      lastChecked: now - 1800000, // 30 min ago
      status: 'needs_attention',
      assignedTo: null,
      position: this.STATION_LOCATIONS.pump1.pos,
      entityId: this.STATION_LOCATIONS.pump1.entityId,
    });

    this.tasks.set('check-pump2', {
      id: 'check-pump2',
      name: 'Check gas pump 2',
      locationName: this.STATION_LOCATIONS.pump2.name,
      description: 'Check fuel levels, clean nozzles, check for spills',
      frequency: 'constant',
      priority: 2,
      lastChecked: now - 1900000, // ~32 min ago
      status: 'idle',
      assignedTo: null,
      position: this.STATION_LOCATIONS.pump2.pos,
      entityId: this.STATION_LOCATIONS.pump2.entityId,
    });

    // Stock tasks
    this.tasks.set('stock-shelves', {
      id: 'stock-shelves',
      name: 'Stock store shelves',
      locationName: this.STATION_LOCATIONS.stock.name,
      description: 'Organize supplies, stock chips, drinks, and snacks',
      frequency: 'periodic',
      priority: 3,
      lastChecked: now - 7200000, // 2 hours ago
      status: 'needs_attention',
      assignedTo: null,
      position: this.STATION_LOCATIONS.stock.pos,
      entityId: this.STATION_LOCATIONS.stock.entityId,
    });

    // Door/welcome tasks
    this.tasks.set('check-door', {
      id: 'check-door',
      name: 'Check main entrance',
      locationName: this.STATION_LOCATIONS.mainDoor.name,
      description: 'Make sure door is working, greet customers',
      frequency: 'periodic',
      priority: 4,
      lastChecked: now - 900000, // 15 min ago
      status: 'idle',
      assignedTo: null,
      position: this.STATION_LOCATIONS.mainDoor.pos,
      entityId: this.STATION_LOCATIONS.mainDoor.entityId,
    });

    // Bathroom tasks
    this.tasks.set('check-bathroom', {
      id: 'check-bathroom',
      name: 'Check bathroom cleanliness',
      locationName: this.STATION_LOCATIONS.toilet.name,
      description: 'Clean if needed, check supplies',
      frequency: 'rare',
      priority: 5,
      lastChecked: now - 14400000, // 4 hours ago
      status: 'idle',
      assignedTo: null,
      position: this.STATION_LOCATIONS.toilet.pos,
      entityId: this.STATION_LOCATIONS.toilet.entityId,
    });

    // Schwepe research task
    this.tasks.set('research-schwepe', {
      id: 'research-schwepe',
      name: 'Research Schwepe',
      locationName: 'Office computer',
      description: 'Search databases, look for clues about the missing deity',
      frequency: 'constant',
      priority: 1,
      lastChecked: now,
      status: 'in_progress',
      assignedTo: 'cleetus',
    });

    logger.info('[GasStationTaskManager] Initialized with tasks:', this.tasks.size);
  }

  /**
   * Get all tasks that need attention
   */
  getTasksNeedingAttention(): GasStationTask[] {
    const now = Date.now();
    const tasks = Array.from(this.tasks.values())
      .filter(task => task.status === 'needs_attention' || task.status === 'idle')
      .sort((a, b) => a.priority - b.priority);

    logger.info('[GasStationTaskManager] Tasks needing attention:', tasks.length);
    return tasks;
  }

  /**
   * Get a specific task that Cleetus should do himself
   */
  getNextCleetusTask(): GasStationTask | null {
    const tasks = this.getTasksNeedingAttention();
    const cleetusTasks = tasks.filter(t => t.assignedTo === null && t.priority <= 3);
    return cleetusTasks[0] || null;
  }

  /**
   * Assign a task to a player
   */
  assignTaskToPlayer(taskId: string): GasStationTask | null {
    const task = this.tasks.get(taskId);
    if (task && task.status !== 'in_progress') {
      task.assignedTo = 'player';
      task.status = 'in_progress';
      task.lastChecked = Date.now();
      logger.info(`[GasStationTaskManager] Task assigned to player: ${taskId}`);
      return task;
    }
    return null;
  }

  /**
   * Mark a task as completed
   */
  completeTask(taskId: string, by: 'cleetus' | 'player'): boolean {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'completed';
      task.lastChecked = Date.now();
      logger.info(`[GasStationTaskManager] Task completed by ${by}: ${taskId}`);
      return true;
    }
    return false;
  }

  /**
   * Check if Cleetus is busy with a task
   */
  setCleetusBusy(busy: boolean): void {
    this.isCleetusBusy = busy;
    logger.info(`[GasStationTaskManager] Cleetus busy status: ${busy}`);
  }

  get isBusy(): boolean {
    return this.isCleetusBusy;
  }

  /**
   * Get status report for chat
   */
  getTaskStatusReport(): string {
    const needingAttention = this.getTasksNeedingAttention();
    if (needingAttention.length === 0) {
      return 'All tasks are up to date. I can focus on my Schwepe research.';
    }

    const urgentTasks = needingAttention.filter(t => t.priority <= 2);
    const otherTasks = needingAttention.filter(t => t.priority > 2);

    let report = `Found ${needingAttention.length} tasks that need doing.`;

    if (urgentTasks.length > 0) {
      report += ` Urgent: ${urgentTasks.map(t => t.name).join(', ')}.`;
    }

    if (otherTasks.length > 0) {
      const sample = otherTasks.slice(0, 2).map(t => t.name);
      report += ` Also: ${sample.join(', ')}`;
      if (otherTasks.length > 2) {
        report += `, and ${otherTasks.length - 2} more.`;
      }
    }

    return report;
  }

  /**
   * Reset completed tasks to idle after a period
   */
  updateTaskCycles(): void {
    const now = Date.now();
    const resetTime = 30 * 60 * 1000; // 30 minutes

    for (const task of this.tasks.values()) {
      if (task.status === 'completed' && now - task.lastChecked > resetTime) {
        task.status = 'idle';
        task.assignedTo = null;
        logger.info(`[GasStationTaskManager] Task reset to idle: ${task.id}`);
      }
    }
  }
}

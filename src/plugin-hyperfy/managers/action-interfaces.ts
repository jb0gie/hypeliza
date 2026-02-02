export interface ActionData {
  id: string;
  entityId: string;
  name: string;
  label: string;
  scriptName: string;
  position: { x: number; y: number; z: number };
  distance: number;
  isInteractable: boolean;
  metadata?: Record<string, any>;
}

export interface ActionState {
  currentAction: string | null;
  nearbyActions: ActionData[];
  lastDetectionTime: number;
}
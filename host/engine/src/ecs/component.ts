/**
 * Component contracts and storage registry.
 */
import type { EntityId } from './entity';

/**
 * Base contract for any component attached to an entity.
 */
export interface Component {
  readonly type: string;
}

/**
 * High-performance storage managing component instances indexed by entity ID and type.
 */
export class ComponentStore {
  // Map of componentType -> Map of entityId -> Component
  private readonly _byType = new Map<string, Map<EntityId, Component>>();
  // Map of entityId -> Map of componentType -> Component
  private readonly _byEntity = new Map<EntityId, Map<string, Component>>();

  /**
   * Attaches or replaces a component for the given entity.
   */
  set(entityId: EntityId, component: Component): void {
    const type = component.type;

    let typeMap = this._byType.get(type);
    if (!typeMap) {
      typeMap = new Map<EntityId, Component>();
      this._byType.set(type, typeMap);
    }
    typeMap.set(entityId, component);

    let entityMap = this._byEntity.get(entityId);
    if (!entityMap) {
      entityMap = new Map<string, Component>();
      this._byEntity.set(entityId, entityMap);
    }
    entityMap.set(type, component);
  }

  /**
   * Retrieves a component for the specified entity by type name.
   */
  get<T extends Component = Component>(entityId: EntityId, componentType: string): T | undefined {
    return this._byType.get(componentType)?.get(entityId) as T | undefined;
  }

  /**
   * Checks if an entity possesses a component of the specified type.
   */
  has(entityId: EntityId, componentType: string): boolean {
    return this._byType.get(componentType)?.has(entityId) ?? false;
  }

  /**
   * Detaches a component of the specified type from an entity.
   *
   * @returns True if the component existed and was removed, false otherwise.
   */
  delete(entityId: EntityId, componentType: string): boolean {
    const typeMap = this._byType.get(componentType);
    const removedFromType = typeMap ? typeMap.delete(entityId) : false;

    const entityMap = this._byEntity.get(entityId);
    if (entityMap) {
      entityMap.delete(componentType);
      if (entityMap.size === 0) {
        this._byEntity.delete(entityId);
      }
    }

    return removedFromType;
  }

  /**
   * Returns all components attached to the specified entity.
   */
  getAllForEntity(entityId: EntityId): Component[] {
    const entityMap = this._byEntity.get(entityId);
    if (!entityMap) return [];
    return Array.from(entityMap.values());
  }

  /**
   * Detaches and removes all components for a given entity (called on entity destruction).
   */
  removeAllForEntity(entityId: EntityId): void {
    const entityMap = this._byEntity.get(entityId);
    if (!entityMap) return;

    for (const type of entityMap.keys()) {
      this._byType.get(type)?.delete(entityId);
    }
    this._byEntity.delete(entityId);
  }

  /**
   * Returns all EntityIds possessing a component of the specified type.
   */
  getEntitiesWith(componentType: string): Set<EntityId> {
    const typeMap = this._byType.get(componentType);
    if (!typeMap) return new Set();
    return new Set(typeMap.keys());
  }

  /**
   * Clears all stored components.
   */
  clear(): void {
    this._byType.clear();
    this._byEntity.clear();
  }
}

/**
 * Generic ECS World orchestrating entities, components, systems, and intents.
 */
import { ComponentStore, type Component } from './component';
import { EntityManager, type EntityId } from './entity';
import { IntentStore, type IntentFlusher } from './intent';
import { createMetadata, createName, type MetadataComponent, type NameComponent } from './metadata';
import { SystemPipeline, type System, type SystemContext, type SystemStep } from './system';

export class EcsWorld implements IntentFlusher {
  readonly entities = new EntityManager();
  readonly components = new ComponentStore();
  readonly intents = new IntentStore();
  readonly systems = new SystemPipeline<EcsWorld>();

  /**
   * Spawns a new entity and returns its ID.
   */
  createEntity(): EntityId {
    return this.entities.create();
  }

  /**
   * Destroys an entity and immediately detaches all its attached components.
   */
  destroyEntity(entityId: EntityId): boolean {
    if (this.entities.destroy(entityId)) {
      this.components.removeAllForEntity(entityId);
      return true;
    }
    return false;
  }

  /**
   * Checks whether the entity is alive in this world.
   */
  isAlive(entityId: EntityId): boolean {
    return this.entities.isAlive(entityId);
  }

  /**
   * Attaches or updates a component on an entity.
   */
  attachComponent(entityId: EntityId, component: Component): void {
    if (!this.entities.isAlive(entityId)) {
      throw new Error(`Cannot attach component: Entity ${entityId} is not alive.`);
    }
    this.components.set(entityId, component);
  }

  /**
   * Detaches a component from an entity by component type name.
   */
  detachComponent(entityId: EntityId, componentType: string): boolean {
    return this.components.delete(entityId, componentType);
  }

  /**
   * Retrieves a component from an entity.
   */
  getComponent<T extends Component = Component>(
    entityId: EntityId,
    componentType: string
  ): T | undefined {
    return this.components.get<T>(entityId, componentType);
  }

  /**
   * Checks if an entity possesses a component of the specified type.
   */
  hasComponent(entityId: EntityId, componentType: string): boolean {
    return this.components.has(entityId, componentType);
  }

  /**
   * Queries all entities possessing all requested component types.
   *
   * @param componentTypes Names of component types that matching entities must possess.
   * @returns Array of matching entity IDs.
   */
  query(...componentTypes: string[]): EntityId[] {
    if (componentTypes.length === 0) {
      return this.entities.getActiveEntities();
    }

    let result: Set<EntityId> | null = null;
    for (const type of componentTypes) {
      const matching = this.components.getEntitiesWith(type);
      if (result === null) {
        result = new Set(matching);
      } else {
        for (const id of result) {
          if (!matching.has(id)) {
            result.delete(id);
          }
        }
      }
      if (result.size === 0) break;
    }

    return result ? Array.from(result) : [];
  }

  /**
   * Sets or replaces the human-readable name of an entity.
   */
  setEntityName(entityId: EntityId, name: string): void {
    const existing = this.getComponent<NameComponent>(entityId, 'Name');
    if (existing) {
      existing.name = name;
    } else {
      this.attachComponent(entityId, createName(name));
    }
  }

  /**
   * Retrieves the human-readable name of an entity if assigned.
   */
  getEntityName(entityId: EntityId): string | undefined {
    return this.getComponent<NameComponent>(entityId, 'Name')?.name;
  }

  /**
   * Finds the first entity possessing the exact given name.
   */
  findEntityByName(name: string): EntityId | undefined {
    const ids = this.components.getEntitiesWith('Name');
    for (const id of ids) {
      const comp = this.components.get<NameComponent>(id, 'Name');
      if (comp?.name === name) return id;
    }
    return undefined;
  }

  /**
   * Finds all entities matching a given name or regular expression pattern.
   */
  findEntitiesByName(pattern: string | RegExp): EntityId[] {
    const matches: EntityId[] = [];
    const ids = this.components.getEntitiesWith('Name');
    const isRegex = pattern instanceof RegExp;

    for (const id of ids) {
      const comp = this.components.get<NameComponent>(id, 'Name');
      if (!comp) continue;
      if (isRegex ? pattern.test(comp.name) : comp.name === pattern) {
        matches.push(id);
      }
    }

    return matches;
  }

  /**
   * Sets or updates a key-value entry in the entity's MetadataComponent.
   */
  setMetadataKV(entityId: EntityId, key: string, value: unknown): void {
    let metadata = this.getComponent<MetadataComponent>(entityId, 'Metadata');
    if (!metadata) {
      metadata = createMetadata();
      this.attachComponent(entityId, metadata);
    }
    metadata.entries.set(key, value);
  }

  /**
   * Retrieves a metadata value by key for an entity.
   */
  getMetadataKV<T = unknown>(entityId: EntityId, key: string): T | undefined {
    const metadata = this.getComponent<MetadataComponent>(entityId, 'Metadata');
    return metadata?.entries.get(key) as T | undefined;
  }

  /**
   * Finds all entities possessing a specific metadata key (and optional matching value).
   */
  findEntitiesByMetadata(key: string, value?: unknown): EntityId[] {
    const matches: EntityId[] = [];
    const ids = this.components.getEntitiesWith('Metadata');

    for (const id of ids) {
      const comp = this.components.get<MetadataComponent>(id, 'Metadata');
      if (!comp || !comp.entries.has(key)) continue;

      if (value === undefined || comp.entries.get(key) === value) {
        matches.push(id);
      }
    }

    return matches;
  }

  /**
   * Adds a system to a given execution stage.
   */
  addSystem(step: SystemStep, system: System<EcsWorld>): this {
    this.systems.add(step, system);
    return this;
  }

  /**
   * Flushes all queued intents in the intent store.
   */
  flushIntents(): void {
    this.intents.flush(this);
  }

  /**
   * Executes a single frame cycle:
   * 1. Runs `input` stage systems.
   * 2. Flushes intents.
   * 3. Runs `update` stage systems.
   * 4. Flushes intents.
   * 5. Runs `preRender` stage systems.
   * 6. Flushes intents.
   * 7. Runs `postRender` stage systems.
   * 8. Final flush of any cleanup intents.
   */
  step(context: SystemContext): void {
    this.systems.runStep('input', this, context);
    this.flushIntents();

    this.systems.runStep('update', this, context);
    this.flushIntents();

    this.systems.runStep('preRender', this, context);
    this.flushIntents();

    this.systems.runStep('postRender', this, context);
    this.flushIntents();
  }

  /**
   * Resets the entire world, clearing entities, components, systems, and intents.
   */
  clear(): void {
    this.components.clear();
    this.entities.clear();
    this.intents.clear();
    this.systems.clear();
  }
}

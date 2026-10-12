# galfus-multiverse

Graphics execution graph orchestration, dependency validation, topological scheduling, and presentation coordination.

## Responsibilities

- **Graph Topology Management**: Owns the registration of realms, connectors, and targets.
- **Connection & Port Validation**: Verifies port compatibility between producers, connectors, and destinations.
- **Dependency Analysis & Scheduling**: Computes acyclic execution order (DAG) and invalidates cached plans when graph topology mutates.
- **Graph Execution Dispatch**: Orchestrates the sequential or parallel dispatch of realm workloads, connector operations, and target presentations.

## Invariants & Non-Goals

- **Coordinator, Not Drawer**: Coordinates and schedules graph nodes; does not know how a 2D sprite, 3D mesh, or compositor shader is implemented.
- **No Implicit Cycles**: Graph dependencies must be acyclic. Feedback loops require explicit multi-buffer/history semantics.
- **No Event Loop Ownership**: Does not drive the application frame; the host decides when to invoke graph execution.

# galfus-realm-core

Abstract Realm contracts, execution contexts, and input/output port specifications.

## Responsibilities

- **Realm Contract**: Defines the trait/interface for graphics-producing units participating in graph execution.
- **Port & Output Descriptors**: Formal definitions for realm inputs and outputs (formats, dimensions, sample counts, attachments, synchronization requirements).
- **Execution Context**: Defines the context provided during execution (GPU command encoders, viewports, frame metadata).
- **Lifecycle Protocol**: Explicit hooks for resource preparation, execution dispatch, readiness validation, and teardown.

## Invariants & Non-Goals

- **Implementation Agnostic**: Contains no concrete 2D or 3D rendering logic.
- **No Graph Scheduling**: Defines the contracts that nodes fulfill, but does not own graph validation, dependency analysis, or scheduling (owned by `galfus-multiverse`).

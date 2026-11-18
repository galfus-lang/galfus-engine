import type { DescSpec, FunctionSpec } from './types';

export const hierarchyPhysicsDescriptors: DescSpec[] = [
  {
    kind: 'enum',
    name: 'RigidBodyType',
    doc: 'Rigid body simulation type.',
    values: ['dynamic', 'fixed', 'kinematicPosition', 'kinematicVelocity']
  },
  {
    kind: 'object',
    name: 'RigidBody2DDesc',
    doc: 'Descriptor for configuring a 2D rigid body.',
    fields: {
      bodyType: { type: { ref: 'RigidBodyType' }, optional: true },
      mass: { type: 'number', optional: true },
      gravityScale: { type: 'number', optional: true },
      linearDamping: { type: 'number', optional: true },
      angularDamping: { type: 'number', optional: true },
      linearVelocity: { type: { tuple: ['number', 'number'] }, optional: true },
      angularVelocity: { type: 'number', optional: true },
      restitution: { type: 'number', optional: true },
      friction: { type: 'number', optional: true },
      ccd: { type: 'boolean', optional: true },
      lockTranslations: { type: 'boolean', optional: true },
      lockRotations: { type: 'boolean', optional: true },
      initialPosition: { type: { tuple: ['number', 'number'] }, optional: true },
      initialRotation: { type: 'number', optional: true },
      initialScale: { type: { tuple: ['number', 'number'] }, optional: true }
    }
  },
  {
    kind: 'object',
    name: 'RigidBody3DDesc',
    doc: 'Descriptor for configuring a 3D rigid body.',
    fields: {
      bodyType: { type: { ref: 'RigidBodyType' }, optional: true },
      mass: { type: 'number', optional: true },
      gravityScale: { type: 'number', optional: true },
      linearDamping: { type: 'number', optional: true },
      angularDamping: { type: 'number', optional: true },
      linearVelocity: { type: { tuple: ['number', 'number', 'number'] }, optional: true },
      angularVelocity: { type: { tuple: ['number', 'number', 'number'] }, optional: true },
      enabledRotations: { type: { tuple: ['boolean', 'boolean', 'boolean'] }, optional: true },
      restitution: { type: 'number', optional: true },
      friction: { type: 'number', optional: true },
      ccd: { type: 'boolean', optional: true },
      lockTranslations: { type: 'boolean', optional: true },
      lockRotations: { type: 'boolean', optional: true },
      initialPosition: { type: { tuple: ['number', 'number', 'number'] }, optional: true },
      initialRotation: {
        type: { tuple: ['number', 'number', 'number', 'number'] },
        optional: true
      },
      initialScale: { type: { tuple: ['number', 'number', 'number'] }, optional: true }
    }
  }
];

export const hierarchyPhysicsFunctions: FunctionSpec[] = [
  {
    cName: 'galfus_realm_2d_body_command',
    methodName: 'realm2dBodyCommand',
    doc: 'Applies a body command and returns its JSON result.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Realm logical ID.' },
      { name: 'entityId', type: 'u32', doc: 'Model logical ID.' },
      { name: 'command', type: 'string', doc: 'Physics command JSON.' }
    ],
    returnType: 'string'
  },
  {
    cName: 'galfus_realm_3d_body_command',
    methodName: 'realm3dBodyCommand',
    doc: 'Applies a body command and returns its JSON result.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Realm logical ID.' },
      { name: 'entityId', type: 'u32', doc: 'Model logical ID.' },
      { name: 'command', type: 'string', doc: 'Physics command JSON.' }
    ],
    returnType: 'string'
  },
  // 2D Hierarchy & Physics
  {
    cName: 'galfus_realm_2d_attach',
    methodName: 'realm2dAttach',
    doc: 'Attaches an origin 2D entity to a target entity with a constraint.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'originId', type: 'u32', doc: 'Logical ID of origin entity.' },
      { name: 'targetId', type: 'u32', doc: 'Logical ID of target entity.' },
      { name: 'constraintJson', type: 'string', doc: 'Constraint descriptor JSON.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_detach',
    methodName: 'realm2dDetach',
    doc: 'Detaches a 2D entity from its parent anchor.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'originId', type: 'u32', doc: 'Logical ID of origin entity.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_enable_physics',
    methodName: 'realm2dEnablePhysics',
    doc: 'Enables native 2D Rapier physics.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'gravityX', type: 'f32', doc: 'Gravity X component.' },
      { name: 'gravityY', type: 'f32', doc: 'Gravity Y component.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_attach_rigidbody',
    methodName: 'realm2dAttachRigidbody',
    doc: 'Attaches a rigid body to a 2D entity.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'entityId', type: 'u32', doc: 'Logical ID of the entity.' },
      { name: 'desc', type: { json: 'RigidBody2DDesc' }, doc: 'Rigid body descriptor.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_remove_rigidbody',
    methodName: 'realm2dRemoveRigidbody',
    doc: 'Removes a rigid body from a 2D entity.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'entityId', type: 'u32', doc: 'Logical ID of the entity.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_apply_impulse',
    methodName: 'realm2dApplyImpulse',
    doc: 'Applies an impulse to a 2D rigid body.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'entityId', type: 'u32', doc: 'Logical ID of the entity.' },
      { name: 'impulseX', type: 'f32', doc: 'Impulse X.' },
      { name: 'impulseY', type: 'f32', doc: 'Impulse Y.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_apply_force',
    methodName: 'realm2dApplyForce',
    doc: 'Applies a force for the next 2D physics step; reapply it each step for continuous force.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'entityId', type: 'u32', doc: 'Logical ID of the entity.' },
      { name: 'forceX', type: 'f32', doc: 'Force X.' },
      { name: 'forceY', type: 'f32', doc: 'Force Y.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_apply_torque',
    methodName: 'realm2dApplyTorque',
    doc: 'Applies torque to a 2D rigid body.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'entityId', type: 'u32', doc: 'Logical ID of the entity.' },
      { name: 'torque', type: 'f32', doc: 'Torque value.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_step_physics',
    methodName: 'realm2dStepPhysics',
    doc: 'Steps the 2D physics simulation by dt seconds on fixed tick.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'dt', type: 'f32', doc: 'Fixed delta time in seconds.' }
    ],
    returnType: 'string'
  },
  {
    cName: 'galfus_realm_2d_set_linear_velocity',
    methodName: 'realm2dSetLinearVelocity',
    doc: 'Sets the linear velocity of a 2D rigid body.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'entityId', type: 'u32', doc: 'Logical ID of the entity.' },
      { name: 'vx', type: 'f32', doc: 'Linear velocity X.' },
      { name: 'vy', type: 'f32', doc: 'Linear velocity Y.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_set_angular_velocity',
    methodName: 'realm2dSetAngularVelocity',
    doc: 'Sets the angular velocity of a 2D rigid body.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'entityId', type: 'u32', doc: 'Logical ID of the entity.' },
      { name: 'omega', type: 'f32', doc: 'Angular velocity in radians/sec.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_2d_query_point',
    methodName: 'realm2dQueryPoint',
    doc: 'Queries 2D colliders at point.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'x', type: 'f32', doc: 'Point X.' },
      { name: 'y', type: 'f32', doc: 'Point Y.' },
      { name: 'mask', type: 'u32', doc: 'Collision mask.' }
    ],
    returnType: 'string'
  },
  {
    cName: 'galfus_realm_2d_raycast',
    methodName: 'realm2dRaycast',
    doc: 'Casts a ray across 2D colliders.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 2D Realm.' },
      { name: 'originX', type: 'f32', doc: 'Origin X.' },
      { name: 'originY', type: 'f32', doc: 'Origin Y.' },
      { name: 'dirX', type: 'f32', doc: 'Direction X.' },
      { name: 'dirY', type: 'f32', doc: 'Direction Y.' },
      { name: 'maxDist', type: 'f32', doc: 'Maximum distance.' },
      { name: 'mask', type: 'u32', doc: 'Collision mask.' }
    ],
    returnType: 'string'
  },

  // 3D Hierarchy & Physics
  {
    cName: 'galfus_realm_3d_attach',
    methodName: 'realm3dAttach',
    doc: 'Attaches an origin 3D entity to a target entity with a constraint.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'originId', type: 'u32', doc: 'Logical ID of origin entity.' },
      { name: 'targetId', type: 'u32', doc: 'Logical ID of target entity.' },
      { name: 'constraintJson', type: 'string', doc: 'Constraint descriptor JSON.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_detach',
    methodName: 'realm3dDetach',
    doc: 'Detaches a 3D entity from its parent anchor.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'originId', type: 'u32', doc: 'Logical ID of origin entity.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_enable_physics',
    methodName: 'realm3dEnablePhysics',
    doc: 'Enables native 3D Rapier physics.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'gravityX', type: 'f32', doc: 'Gravity X component.' },
      { name: 'gravityY', type: 'f32', doc: 'Gravity Y component.' },
      { name: 'gravityZ', type: 'f32', doc: 'Gravity Z component.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_attach_rigidbody',
    methodName: 'realm3dAttachRigidbody',
    doc: 'Attaches a rigid body to a 3D entity.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'entityId', type: 'u32', doc: 'Logical ID of the entity.' },
      { name: 'desc', type: { json: 'RigidBody3DDesc' }, doc: 'Rigid body descriptor.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_remove_rigidbody',
    methodName: 'realm3dRemoveRigidbody',
    doc: 'Removes a rigid body from a 3D entity.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'entityId', type: 'u32', doc: 'Logical ID of the entity.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_apply_impulse',
    methodName: 'realm3dApplyImpulse',
    doc: 'Applies an impulse to a 3D rigid body.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'entityId', type: 'u32', doc: 'Logical ID of the entity.' },
      { name: 'impulseX', type: 'f32', doc: 'Impulse X.' },
      { name: 'impulseY', type: 'f32', doc: 'Impulse Y.' },
      { name: 'impulseZ', type: 'f32', doc: 'Impulse Z.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_apply_force',
    methodName: 'realm3dApplyForce',
    doc: 'Applies a force for the next 3D physics step; reapply it each step for continuous force.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'entityId', type: 'u32', doc: 'Logical ID of the entity.' },
      { name: 'forceX', type: 'f32', doc: 'Force X.' },
      { name: 'forceY', type: 'f32', doc: 'Force Y.' },
      { name: 'forceZ', type: 'f32', doc: 'Force Z.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_apply_torque',
    methodName: 'realm3dApplyTorque',
    doc: 'Applies torque to a 3D rigid body.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'entityId', type: 'u32', doc: 'Logical ID of the entity.' },
      { name: 'torqueX', type: 'f32', doc: 'Torque X.' },
      { name: 'torqueY', type: 'f32', doc: 'Torque Y.' },
      { name: 'torqueZ', type: 'f32', doc: 'Torque Z.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_step_physics',
    methodName: 'realm3dStepPhysics',
    doc: 'Steps the 3D physics simulation by dt seconds on fixed tick.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'dt', type: 'f32', doc: 'Fixed delta time in seconds.' }
    ],
    returnType: 'string'
  },
  {
    cName: 'galfus_realm_3d_set_linear_velocity',
    methodName: 'realm3dSetLinearVelocity',
    doc: 'Sets the linear velocity of a 3D rigid body.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'entityId', type: 'u32', doc: 'Logical ID of the entity.' },
      { name: 'vx', type: 'f32', doc: 'Linear velocity X.' },
      { name: 'vy', type: 'f32', doc: 'Linear velocity Y.' },
      { name: 'vz', type: 'f32', doc: 'Linear velocity Z.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_set_angular_velocity',
    methodName: 'realm3dSetAngularVelocity',
    doc: 'Sets the angular velocity of a 3D rigid body.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'entityId', type: 'u32', doc: 'Logical ID of the entity.' },
      { name: 'wx', type: 'f32', doc: 'Angular velocity X.' },
      { name: 'wy', type: 'f32', doc: 'Angular velocity Y.' },
      { name: 'wz', type: 'f32', doc: 'Angular velocity Z.' }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_realm_3d_raycast',
    methodName: 'realm3dRaycast',
    doc: 'Casts a ray across 3D colliders.',
    params: [
      { name: 'realmId', type: 'u32', doc: 'Logical ID of the 3D Realm.' },
      { name: 'originX', type: 'f32', doc: 'Origin X.' },
      { name: 'originY', type: 'f32', doc: 'Origin Y.' },
      { name: 'originZ', type: 'f32', doc: 'Origin Z.' },
      { name: 'dirX', type: 'f32', doc: 'Direction X.' },
      { name: 'dirY', type: 'f32', doc: 'Direction Y.' },
      { name: 'dirZ', type: 'f32', doc: 'Direction Z.' },
      { name: 'maxDist', type: 'f32', doc: 'Maximum distance.' },
      { name: 'mask', type: 'u32', doc: 'Collision mask.' }
    ],
    returnType: 'string'
  }
];

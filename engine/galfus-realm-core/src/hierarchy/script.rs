use rhai::{AST, CustomType, Engine, Scope};

/// Script-accessible 2D transform component.
#[derive(Debug, Clone, Copy, PartialEq, Default, CustomType)]
pub struct ScriptTransform2D {
    pub x: f32,
    pub y: f32,
    pub rotation: f32,
    pub scale_x: f32,
    pub scale_y: f32,
}

impl ScriptTransform2D {
    pub fn new(x: f32, y: f32, rotation: f32, scale_x: f32, scale_y: f32) -> Self {
        Self {
            x,
            y,
            rotation,
            scale_x,
            scale_y,
        }
    }

    pub fn copy_position(&mut self, other: ScriptTransform2D) {
        self.x = other.x;
        self.y = other.y;
    }

    pub fn set_position(&mut self, x: f32, y: f32) {
        self.x = x;
        self.y = y;
    }
}

/// Script-accessible 3D transform component.
#[derive(Debug, Clone, Copy, PartialEq, Default, CustomType)]
pub struct ScriptTransform3D {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub rx: f32,
    pub ry: f32,
    pub rz: f32,
    pub rw: f32,
    pub scale_x: f32,
    pub scale_y: f32,
    pub scale_z: f32,
}

impl ScriptTransform3D {
    pub fn copy_position(&mut self, other: ScriptTransform3D) {
        self.x = other.x;
        self.y = other.y;
        self.z = other.z;
    }

    pub fn set_position(&mut self, x: f32, y: f32, z: f32) {
        self.x = x;
        self.y = y;
        self.z = z;
    }
}

/// Rhai script manager for anchor constraints.
pub struct HierarchyScriptEngine {
    engine: Engine,
}

impl Default for HierarchyScriptEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl HierarchyScriptEngine {
    pub fn new() -> Self {
        let mut engine = Engine::new();
        engine.build_type::<ScriptTransform2D>();
        engine.build_type::<ScriptTransform3D>();

        engine.register_fn("copy_position", ScriptTransform2D::copy_position);
        engine.register_fn("set_position", ScriptTransform2D::set_position);
        engine.register_fn("copy_position", ScriptTransform3D::copy_position);
        engine.register_fn("set_position", ScriptTransform3D::set_position);

        // Register math helper functions
        engine.register_fn("sin", |x: f32| x.sin());
        engine.register_fn("cos", |x: f32| x.cos());
        engine.register_fn("tan", |x: f32| x.tan());
        engine.register_fn("atan2", |y: f32, x: f32| y.atan2(x));
        engine.register_fn("sqrt", |x: f32| x.sqrt());
        engine.register_fn("abs", |x: f32| x.abs());
        engine.register_fn("min", |a: f32, b: f32| a.min(b));
        engine.register_fn("max", |a: f32, b: f32| a.max(b));
        engine.register_fn("clamp", |val: f32, min_val: f32, max_val: f32| {
            val.clamp(min_val, max_val)
        });
        engine.register_fn("hypot", |x: f32, y: f32| x.hypot(y));

        Self { engine }
    }

    pub fn compile(&self, script: &str) -> Result<AST, String> {
        self.engine.compile(script).map_err(|e| e.to_string())
    }

    pub fn eval_2d(
        &self,
        ast: &AST,
        target: ScriptTransform2D,
        local: ScriptTransform2D,
        out: &mut ScriptTransform2D,
        time: f32,
        dt: f32,
    ) -> Result<(), String> {
        let mut scope = Scope::new();
        scope.push("target", target);
        scope.push("local", local);
        scope.push("out", *out);
        scope.push("time", time);
        scope.push("dt", dt);

        self.engine
            .run_ast_with_scope(&mut scope, ast)
            .map_err(|e| e.to_string())?;

        if let Some(res) = scope.get_value::<ScriptTransform2D>("out") {
            *out = res;
        }
        Ok(())
    }

    pub fn eval_3d(
        &self,
        ast: &AST,
        target: ScriptTransform3D,
        local: ScriptTransform3D,
        out: &mut ScriptTransform3D,
        time: f32,
        dt: f32,
    ) -> Result<(), String> {
        let mut scope = Scope::new();
        scope.push("target", target);
        scope.push("local", local);
        scope.push("out", *out);
        scope.push("time", time);
        scope.push("dt", dt);

        self.engine
            .run_ast_with_scope(&mut scope, ast)
            .map_err(|e| e.to_string())?;

        if let Some(res) = scope.get_value::<ScriptTransform3D>("out") {
            *out = res;
        }
        Ok(())
    }
}

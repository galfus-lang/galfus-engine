pub mod content;
pub mod logical;

pub use content::ContentId;
pub use logical::{
    LogicalId, RESERVED_LOGICAL_ID_COUNT, RESERVED_RANGE_END, RESERVED_RANGE_START,
    is_reserved_logical_id, validate_host_logical_id,
};

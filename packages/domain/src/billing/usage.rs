use super::plan::GeoFeature;
use crate::Event;

/// Daily usage counters — mirrors Express `req.usage` from the subscription store.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct UsageRecord {
    ai_queries: u32,
    grounding_calls: u32,
    exports: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct UsageRecordParts {
    pub ai_queries: u32,
    pub grounding_calls: u32,
    pub exports: u32,
}

impl UsageRecord {
    pub fn new(ai_queries: u32, grounding_calls: u32, exports: u32) -> Self {
        Self {
            ai_queries,
            grounding_calls,
            exports,
        }
    }

    pub fn zero() -> Self {
        Self::default()
    }

    pub fn into_parts(self) -> UsageRecordParts {
        let Self {
            ai_queries,
            grounding_calls,
            exports,
        } = self;
        UsageRecordParts {
            ai_queries,
            grounding_calls,
            exports,
        }
    }

    pub fn ai_queries(&self) -> u32 {
        self.ai_queries
    }

    pub fn grounding_calls(&self) -> u32 {
        self.grounding_calls
    }

    pub fn exports(&self) -> u32 {
        self.exports
    }

    pub fn increment(self, counter: UsageCounter) -> Self {
        match counter {
            UsageCounter::AiQueries => Self {
                ai_queries: self.ai_queries.saturating_add(1),
                ..self
            },
            UsageCounter::GroundingCalls => Self {
                grounding_calls: self.grounding_calls.saturating_add(1),
                ..self
            },
            UsageCounter::Exports => Self {
                exports: self.exports.saturating_add(1),
                ..self
            },
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum UsageCounter {
    AiQueries,
    GroundingCalls,
    Exports,
}

impl UsageCounter {
    pub fn for_feature(feature: GeoFeature) -> Option<Self> {
        match feature {
            GeoFeature::AiQuery => Some(Self::AiQueries),
            GeoFeature::Export => Some(Self::Exports),
            GeoFeature::PoiSearch | GeoFeature::PoiSearchBasic => Some(Self::GroundingCalls),
            _ => None,
        }
    }
}

impl Event for UsageRecord {
    fn get_type(&self) -> &str {
        "USAGE_RECORD"
    }
}

use crate::{value_objects::date_time::Weekday, DateTime};

#[derive(Debug, Clone)]
pub enum TimeWindow {
    Absolute {
        start: DateTime,
        end: DateTime,
    },

    Recurring {
        days: Vec<Weekday>,
        start_seconds: u32,
        end_seconds: u32,
    },
}
impl TimeWindow {
    pub fn allows(&self, now: DateTime, weekday: Weekday, seconds_since_midnight: u32) -> bool {
        match self {
            TimeWindow::Absolute { start, end } => now.between(start, end),

            TimeWindow::Recurring {
                days,
                start_seconds,
                end_seconds,
            } => {
                if !days.contains(&weekday) {
                    return false;
                }

                if start_seconds <= end_seconds {
                    seconds_since_midnight >= *start_seconds
                        && seconds_since_midnight <= *end_seconds
                } else {
                    // overnight window
                    seconds_since_midnight >= *start_seconds
                        || seconds_since_midnight <= *end_seconds
                }
            }
        }
    }
}

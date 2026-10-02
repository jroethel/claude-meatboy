-- Every run the Worker accepted, after replaying it. `levels` is the submitted inputs, as JSON.
CREATE TABLE runs (
  id INTEGER PRIMARY KEY,
  initials TEXT NOT NULL,
  ms INTEGER NOT NULL,
  deaths INTEGER NOT NULL,
  levels TEXT NOT NULL,
  created TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX runs_by_time ON runs (ms, deaths);

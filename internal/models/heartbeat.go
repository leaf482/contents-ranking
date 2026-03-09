package models

// HeartbeatEvent represents a single heartbeat signal sent by a client
// during video playback. It carries session, user, and playback state.
type HeartbeatEvent struct {
	SessionID string `json:"session_id"`
	UserID    string `json:"user_id"`
	VideoID   string `json:"video_id"`
	Playhead  int64  `json:"playhead"`
	Timestamp int64  `json:"timestamp"`
}

import React from 'react';
import '../styles/Timer.css';

function Timer({ time, color }) {
  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className={`timer ${color}`}>
      {formatTime(time)}
    </div>
  );
}

export default Timer;
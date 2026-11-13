import React from 'react';

// Move complete slices of the original panorama, including their trees.
// Cutting foliage out of a flattened image also cuts holes in the buildings
// behind it; keeping the artwork intact avoids those gaps during the entrance.
const buildings = [
  { left: 0, right: 91.5, direction: '-100vw', delay: 3 },
  { left: 8.5, right: 68.5, direction: '-100vw', delay: 3.36 },
  { left: 31.5, right: 53, direction: '-100vw', delay: 3.72 },
  { left: 47, right: 40, direction: '100vw', delay: 3.9 },
  { left: 60, right: 25.5, direction: '100vw', delay: 3.54 },
  { left: 74.5, right: 0, direction: '100vw', delay: 3.18 },
];
export function IntroCity() {
  return <div className="intro-city" aria-hidden="true">
    {buildings.map((building, index) => <div key={index} className="intro-city-building" style={{
      clipPath: `inset(0 ${building.right}% 0 ${building.left}%)`,
      animationDelay: `${building.delay}s`,
      '--intro-city-entry': building.direction,
    } as React.CSSProperties}><img className="intro-city-art" src="/splash-hq/houses.png" alt=""/></div>)}
  </div>;
}

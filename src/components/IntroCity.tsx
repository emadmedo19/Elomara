import React, { useId } from 'react';

// Keep the original panorama intact at rest, but move each visible building separately.
const buildings = [
  { left: 0, right: 91.5, direction: '-100vw', delay: 3 },
  { left: 8.5, right: 68.5, direction: '-100vw', delay: 3.36 },
  { left: 31.5, right: 53, direction: '-100vw', delay: 3.72 },
  { left: 47, right: 40, direction: '100vw', delay: 3.9 },
  { left: 60, right: 25.5, direction: '100vw', delay: 3.54 },
  { left: 74.5, right: 0, direction: '100vw', delay: 3.18 },
];

// Shared outlines give the buildings and trees complementary masks: no duplicated foliage.
// Coordinates refer to the existing 2172 × 724 artwork, without changing the source image.
const treeOutlines = [
  [[35, 488], [53, 451], [80, 426], [106, 406], [124, 380], [157, 368], [190, 381], [215, 402], [246, 418], [276, 444], [306, 472], [322, 512], [292, 548], [210, 564], [185, 587], [140, 585], [123, 566], [82, 556], [47, 544]],
  [[320, 550], [345, 518], [374, 493], [416, 479], [454, 493], [489, 521], [522, 551], [528, 583], [491, 605], [461, 609], [445, 623], [414, 623], [396, 611], [357, 607], [323, 585]],
  [[649, 557], [665, 526], [692, 499], [736, 484], [769, 498], [802, 507], [830, 532], [853, 565], [838, 599], [791, 611], [766, 623], [728, 623], [709, 613], [678, 610], [650, 590]],
  [[1484, 508], [1502, 470], [1527, 447], [1550, 424], [1580, 409], [1610, 419], [1640, 443], [1673, 462], [1706, 484], [1719, 521], [1701, 548], [1650, 559], [1627, 573], [1589, 573], [1569, 562], [1515, 555], [1487, 533]],
  [[1826, 433], [1849, 395], [1877, 372], [1896, 346], [1925, 321], [1965, 304], [2003, 317], [2026, 338], [2059, 351], [2088, 376], [2122, 398], [2153, 444], [2142, 481], [2097, 500], [2043, 506], [2018, 524], [1979, 524], [1959, 509], [1898, 498], [1860, 483], [1830, 458]],
].map((points, index) => points.map(([x, y]) => {
  // Include the outermost leaves on the right edge of the original artwork.
  const padding = index === 4 ? 1.12 : 1;
  const centerX = 1990;
  const centerY = 414;
  return `${(centerX + (x - centerX) * padding) / 2172},${(centerY + (y - centerY) * padding) / 724}`;
}).join(' '));

export function IntroCity() {
  const id = useId().replace(/:/g, '');
  const buildingMask = `${id}-buildings`;
  return (
    <div className="intro-city" aria-hidden="true">
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <mask id={buildingMask} maskContentUnits="objectBoundingBox" style={{ maskType: 'luminance' }}>
            <rect width="1" height="1" fill="white" />
            {treeOutlines.map((points, index) => <polygon key={index} points={points} fill="black" />)}
          </mask>
          {treeOutlines.map((points, index) => (
            <clipPath key={index} id={`${id}-tree-${index}`} clipPathUnits="objectBoundingBox">
              <polygon points={points} />
            </clipPath>
          ))}
        </defs>
      </svg>
      {buildings.map((building, index) => (
        <div key={index} className="intro-city-building" style={{
          clipPath: `inset(0 ${building.right}% 0 ${building.left}%)`,
          animationDelay: `${building.delay}s`,
          '--intro-city-entry': building.direction,
        } as React.CSSProperties}>
          <img className="intro-city-art" src="/splash-hq/houses.png" alt="" style={{ maskImage: `url(#${buildingMask})` }} />
        </div>
      ))}
      {treeOutlines.map((_, index) => (
        <img key={index} className="intro-city-art intro-city-tree" src="/splash-hq/houses.png" alt="" style={{ clipPath: `url(#${id}-tree-${index})` }} />
      ))}
    </div>
  );
}

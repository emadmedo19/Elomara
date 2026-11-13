import React, { useId } from 'react';

// Buildings keep their existing side entrances; trees rise on a separate layer.
const buildings = [
  { left: 0, right: 91.5, direction: '-100vw', delay: 3 },
  { left: 8.5, right: 68.5, direction: '-100vw', delay: 3.36 },
  { left: 31.5, right: 53, direction: '-100vw', delay: 3.72 },
  { left: 47, right: 40, direction: '100vw', delay: 3.9 },
  { left: 60, right: 25.5, direction: '100vw', delay: 3.54 },
  { left: 74.5, right: 0, direction: '100vw', delay: 3.18 },
];
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
  const treeGaps = `${id}-tree-gaps`;
  return <div className="intro-city" aria-hidden="true">
    <svg width="0" height="0" className="absolute" aria-hidden="true"><defs>
      <mask id={buildingMask} maskContentUnits="objectBoundingBox" style={{ maskType: 'luminance' }}>
        <rect width="1" height="1" fill="white"/>
        {treeOutlines.map((points, index) => <polygon key={index} points={points} fill="black"/>)}
      </mask>
      <clipPath id={treeGaps} clipPathUnits="objectBoundingBox">
        {treeOutlines.map((points, index) => <polygon key={index} points={points}/>)}
      </clipPath>
      {treeOutlines.map((points, index) => <clipPath key={index} id={`${id}-tree-${index}`} clipPathUnits="objectBoundingBox"><polygon points={points}/></clipPath>)}
    </defs></svg>
    {buildings.map((building, index) => <div key={index} className="intro-city-building" style={{
      clipPath: `inset(0 ${building.right}% 0 ${building.left}%)`,
      animationDelay: `${building.delay}s`,
      '--intro-city-entry': building.direction,
    } as React.CSSProperties}>
      {/* The panorama is flattened. Reconstruct only the facade sections hidden
          by foliage so removing the trees never leaves see-through holes.
          This backing disappears once all trees settle; the final artwork is unchanged. */}
      <svg className="intro-city-art intro-city-backing" viewBox="0 0 2172 724" style={{ clipPath: `url(#${treeGaps})` }}>
        <path fill="#78c7f5" d="M25 340L183 300V549L25 530Z"/>
        <path fill="#5cb9ee" d="M183 280L321 235V562L183 549Z"/>
        <path fill="#34a7e9" d="M321 235L475 190V575L321 562Z"/>
        <path fill="#91d4f8" d="M475 190L656 260V582L475 575Z"/>
        <path fill="#9bd9fa" d="M656 400L699 418V585L656 582Z"/>
        <path fill="#69bef0" d="M699 370L851 330V594L699 585Z"/>
        <path fill="#a4dcf9" d="M851 330L986 380V585L851 594Z"/>
        <path fill="#66bdf0" d="M1334 320L1500 280V550L1334 557Z"/>
        <path fill="#a4dcf9" d="M1500 280L1606 322V539L1500 550Z"/>
        <path fill="#66c2f3" d="M1606 308L1624 315V534L1606 539Z"/>
        <path fill="#50b9f1" d="M1624 240L1919 150V500L1624 534Z"/>
        <path fill="#9ed9f8" d="M1919 150L2128 220V480L1919 500Z"/>
        <g fill="#36a3e6">
          <path d="M54 385L88 376V437L54 443Z M118 365L150 357V422L118 428Z"/>
          <path d="M230 455L280 442V486L230 497Z M230 515L280 504V546L230 554Z"/>
          <path d="M740 513L773 505V535L740 541Z M783 503L818 496V528L783 534Z M740 558L773 552V580L740 585Z M783 550L818 544V575L783 581Z"/>
          <path d="M1525 441L1572 452V479L1525 470Z M1525 488L1572 498V523L1525 516Z"/>
          <path d="M1974 326L2015 341V381L1974 368Z M2030 345L2064 358V396L2030 385Z M1974 391L2015 405V445L1974 433Z M2030 409L2064 420V459L2030 449Z M2080 360L2111 370V407L2080 398Z M2080 423L2111 433V470L2080 462Z"/>
        </g>
        <g fill="#ffe975">
          <path d="M355 515L384 507V564L355 568Z M388 506L414 499V559L388 563Z"/>
          <path d="M579 523L599 530V574L579 571Z M603 531L623 538V577L603 575Z"/>
          <path d="M1687 456L1714 447V498L1687 506Z M1718 446L1747 437V488L1718 497Z"/>
        </g>
      </svg>
      <img className="intro-city-art" src="/splash-hq/houses.png" alt="" style={{ maskImage: `url(#${buildingMask})` }}/>
    </div>)}
    {treeOutlines.map((_, index) => <img key={index} className="intro-city-art intro-city-tree" src="/splash-hq/houses.png" alt="" style={{
      clipPath: `url(#${id}-tree-${index})`, animationDelay: `${4.25 + index * 0.06}s`,
    }}/>) }
  </div>;
}

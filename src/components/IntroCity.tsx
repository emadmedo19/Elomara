import React, { useId } from 'react';

type Point = readonly [number, number];
type WallSpec = { corners: readonly [Point, Point, Point, Point]; columns: number; rows: number; lit?: readonly number[] };
type BuildingSpec = { delay: number; direction: string; roof: string; walls: readonly WallSpec[] };
// Complete architectural layers. No foliage is cut from a flattened picture.
// Keep the existing six-building skyline, perspective and entrance timing.
const buildings: readonly BuildingSpec[] = [
  { delay: 3, direction: '-100vw', roof: 'M25 362L107 340V311L146 298L183 310V350L107 365Z', walls: [
    { corners: [[25,362],[183,310],[183,549],[25,530]], columns: 2, rows: 4 },
  ] },
  { delay: 3.36, direction: '-100vw', roof: 'M321 157L436 116L543 150V183L475 160L321 214Z', walls: [
    { corners: [[183,229],[475,160],[475,575],[183,549]], columns: 3, rows: 6, lit: [1,2] },
    { corners: [[475,160],[656,222],[656,582],[475,575]], columns: 2, rows: 6, lit: [1] },
  ] },
  { delay: 3.72, direction: '-100vw', roof: 'M732 334L836 306L928 333V355L851 330L732 363Z', walls: [
    { corners: [[699,370],[851,330],[851,594],[699,585]], columns: 2, rows: 5 },
    { corners: [[851,330],[986,376],[986,585],[851,594]], columns: 2, rows: 5, lit: [0,1] },
  ] },
  { delay: 3.9, direction: '100vw', roof: 'M1130 406L1194 394L1255 420V441L1194 420L1130 433Z', walls: [
    { corners: [[1066,448],[1194,420],[1194,565],[1066,578]], columns: 2, rows: 4, lit: [1] },
    { corners: [[1194,420],[1266,464],[1266,560],[1194,565]], columns: 1, rows: 3 },
  ] },
  { delay: 3.54, direction: '100vw', roof: 'M1390 284L1500 260L1592 286V309L1500 280L1390 307Z', walls: [
    { corners: [[1334,320],[1500,280],[1500,550],[1334,557]], columns: 2, rows: 5, lit: [0,1] },
    { corners: [[1500,280],[1606,322],[1606,539],[1500,550]], columns: 2, rows: 5 },
  ] },
  { delay: 3.18, direction: '100vw', roof: 'M1775 79L1919 34L2065 80V125L1919 77L1775 121Z', walls: [
    { corners: [[1624,154],[1919,77],[1919,500],[1624,534]], columns: 3, rows: 6, lit: [1,2] },
    { corners: [[1919,77],[2128,145],[2128,480],[1919,500]], columns: 2, rows: 6 },
  ] },
];
const trees = [
  { x: 184, y: 581, scale: 1 }, { x: 427, y: 618, scale: .72 },
  { x: 747, y: 621, scale: .7 }, { x: 1604, y: 568, scale: .8 },
  { x: 1990, y: 520, scale: 1.12 },
];
const leaves = [
  [-119,-91,26],[-97,-121,26],[-65,-145,26],[-30,-162,25],
  [7,-157,28],[44,-145,29],[80,-122,28],[108,-99,27],[128,-76,22],
  [86,-69,32],[43,-65,35],[-2,-70,38],[-47,-76,35],[-89,-72,31],[-126,-66,22],
];
const polygon = (points: readonly Point[]) => points.map(point => point.join(',')).join(' ');
function onWall(corners: WallSpec['corners'], u: number, v: number): Point {
  const [tl,tr,br,bl] = corners;
  return [(tl[0] + (tr[0]-tl[0])*u)*(1-v) + (bl[0]+(br[0]-bl[0])*u)*v,
    (tl[1]+(tr[1]-tl[1])*u)*(1-v) + (bl[1]+(br[1]-bl[1])*u)*v];
}
function Wall({ spec, side, id }: { spec: WallSpec; side: boolean; id: string }) {
  return <g>
    <polygon points={polygon(spec.corners)} fill={`url(#${id}-${side ? 'side' : 'front'})`}/>
    {Array.from({length:spec.columns*spec.rows},(_,index) => {
      const col = index % spec.columns, row = Math.floor(index/spec.columns);
      const u = (col+.22)/spec.columns, right = (col+.78)/spec.columns;
      const v = .11+row*.85/spec.rows, bottom = v+.56*.85/spec.rows;
      const lit = spec.lit?.includes(col);
      const corners = [onWall(spec.corners,u,v),onWall(spec.corners,right,v),onWall(spec.corners,right,bottom),onWall(spec.corners,u,bottom)];
      return <g key={index}>
        <polygon points={polygon(corners)} fill={`url(#${id}-${lit ? 'lit' : 'window'})`} stroke={side ? '#70bff0' : '#42a9e8'} strokeWidth="3"/>
        <path d={`M${corners[0]}L${corners[1]}L${corners[2]}`} fill="none" stroke={lit ? '#3faae8' : '#1789d3'} strokeWidth="3"/>
        {lit && <path d={`M${onWall(spec.corners,(u+right)/2,v)}L${onWall(spec.corners,(u+right)/2,bottom)}`} stroke="#c2c76d" strokeWidth="1.5"/>}
      </g>;
    })}
  </g>;
}
export function IntroCity() {
  const id = useId().replace(/:/g,'');
  return <div className="intro-city" aria-hidden="true">
    <svg width="0" height="0" className="absolute"><defs>
      <linearGradient id={`${id}-front`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#72c6f5"/><stop offset="1" stopColor="#249ee6"/></linearGradient>
      <linearGradient id={`${id}-side`}><stop stopColor="#a0dcfa"/><stop offset="1" stopColor="#65bcf0"/></linearGradient>
      <linearGradient id={`${id}-lit`}><stop stopColor="#fff9aa"/><stop offset=".55" stopColor="#ffe768"/><stop offset="1" stopColor="#ffdf43"/></linearGradient>
      <linearGradient id={`${id}-window`} x2=".6" y2="1"><stop stopColor="#208ed7"/><stop offset="1" stopColor="#68bdf1"/></linearGradient>
      <linearGradient id={`${id}-foliage`} x2=".3" y2="1"><stop stopColor="#158fd1"/><stop offset="1" stopColor="#07549d"/></linearGradient>
    </defs></svg>
    {buildings.map((building,index) => <div key={index} className="intro-city-building" style={{ animationDelay:`${building.delay}s`, '--intro-city-entry':building.direction } as React.CSSProperties}>
      <svg className="intro-city-art" viewBox="0 0 2172 724" data-city-building={index}>
        <path d={building.roof} fill="#239ee5" stroke="#44b0ed" strokeWidth="2"/>
        {building.walls.map((wall,side) => <Wall key={side} spec={wall} side={side>0} id={id}/>)}
      </svg>
    </div>)}
    {trees.map((tree,index) => <svg key={index} className="intro-city-art intro-city-tree" viewBox="0 0 2172 724" data-city-tree={index} style={{animationDelay:`${4.25+index*.06}s`}}>
      <g transform={`translate(${tree.x} ${tree.y}) scale(${tree.scale})`}>
        <ellipse cy="-3" rx="100" ry="8" fill="#075e9c" opacity=".14"/>
        <g fill={`url(#${id}-foliage)`}>
          {leaves.map(([x,y,r],i) => <g key={i}>
            <ellipse cx={x} cy={y} rx={r} ry={r*.76}/>
            {Array.from({length:7},(_,j) => <ellipse key={j} cx={x+Math.cos(j*2.4+i)*r*.83} cy={y+Math.sin(j*2.4+i)*r*.55} rx={r*.31} ry={r*.23}/>)}
          </g>)}
        </g>
        <path d="M-9 0Q-13-62-45-109M8 0Q8-59 54-117M-2-7Q1-89-9-142M-16-45Q-55-77-100-85M10-43Q57-65 106-88M-18-64Q-45-104-58-130M8-68Q27-113 42-141" fill="none" stroke="#074d8e" strokeWidth="9" strokeLinecap="round"/>
        <path d="M0-2Q-6-74-11-135M1-34Q39-70 88-84M-5-39Q-43-79-86-84" fill="none" stroke="#1e8bca" strokeWidth="3" strokeLinecap="round"/>
        <g fill="#41b5e7" opacity=".45">{leaves.map(([x,y,r],i) => <ellipse key={i} cx={x-r*.2} cy={y-r*.25} rx="7" ry="4"/>)}</g>
      </g>
    </svg>)}
  </div>;
}

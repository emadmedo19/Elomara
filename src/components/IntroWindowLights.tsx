import { useEffect, useState } from 'react';

// Window interiors in the unchanged 1281 × 1227 central-building artwork.
// Insets keep the navy frames and white balconies uncovered.
const windows = [
 '412,390 454,369 454,442 412,461',
 '475,358 522,334 522,411 475,434',
 '543,324 599,296 599,428 552,405 543,405',
 '727,324 792,351 792,445 758,437 727,452',
 '816,359 874,383 874,476 816,454',
 '895,393 920,404 920,492 895,481',
 '412,659 453,644 453,727 412,747',
 '474,636 522,621 522,704 474,725',
 '543,613 599,595 599,725 554,707 543,708',
 '727,616 793,637 793,723 755,714 727,728',
 '816,644 870,662 870,742 816,726',
 '890,669 921,679 921,758 890,748',
 '412,942 458,929 458,1008 412,1017',
 '481,924 522,913 522,998 481,1006',
 '544,908 599,896 599,1028 544,1003',
 '728,899 793,913 793,1016 757,1010 728,1022',
 '817,920 854,930 854,1022 817,1017',
 '876,936 922,947 922,1036 876,1028',
 '1038,471 1093,500 1093,573 1038,549',
 '1040,727 1095,758 1095,825 1040,801',
 '1042,949 1101,976 1101,1091 1073,1082 1071,1064 1042,1057',
 '201,957 257,936 257,1043 240,1051 240,1064 201,1076',
];

export function IntroWindowLights() {
  const [lit, setLit] = useState<boolean[]>(() => windows.map(() => false));
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const timers = new Set<number>();
    const stop = () => { timers.forEach(timer => window.clearTimeout(timer)); timers.clear(); };
    const start = () => {
      stop();
      setLit(windows.map(() => false));
      if (preference.matches) return;
      const schedule = (index: number, initial = false) => {
        const timer = window.setTimeout(() => {
          timers.delete(timer);
          setLit(current => current.map((value, i) => i === index ? !value : value));
          schedule(index);
        }, initial ? 1000 + Math.random() * 1700 : 1100 + Math.random() * 2100);
        timers.add(timer);
      };
      windows.forEach((_, index) => schedule(index, true));
    };
    start(); preference.addEventListener('change', start);
    return () => { stop(); preference.removeEventListener('change', start); };
  }, []);
  return <svg className="intro-building-art" viewBox="0 0 1281 1227" aria-hidden="true" focusable="false">
    {windows.map((points,index) => <polygon key={points} points={points} fill="#ffe394" style={{opacity:lit[index] ? .95 : 0, transition:'opacity 380ms ease-in-out'}} />)}
  </svg>;
}

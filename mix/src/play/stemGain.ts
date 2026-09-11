/** Stored stem level remains linear percent: old 100 is still unity, 0 is silence. */
export const STEM_GAIN_MAX = 100 * 10 ** (6 / 20);
export const stemGainText = (value:number) => {
  if(value<=0)return '−∞ dB';
  const db=Math.round(200*Math.log10(value/100))/10;
  return `${db>0?'+':''}${db.toFixed(1)} dB`;
};
export const clampStemGain = (value:number) => Math.max(0,Math.min(STEM_GAIN_MAX,value));

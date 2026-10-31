declare module "*.css";
declare module "*?raw" { const text: string; export default text; }
/** Set by the TabbyDeck Android app (apps/android): a way back to its list of PCs. */
interface Window { TabbyAndroid?: { changePc(): void } }

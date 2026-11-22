import raw from "../../data/ledger.json";
import { parseLedger } from "./load";

// The ledger bundled with the app, so the deployed build does not depend on the file system.
export const ledger = parseLedger(raw);

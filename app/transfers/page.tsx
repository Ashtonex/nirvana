export const dynamic = 'force-dynamic';

import { getDashboardData } from "../actions";
import TransfersClient from "./TransfersClient";

export default async function TransfersPage() {
    const db = await getDashboardData();
    return <TransfersClient db={db} />;
}


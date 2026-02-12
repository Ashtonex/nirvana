import { getDashboardData } from "../actions";
import InventoryMaster from "./InventoryMaster";

export default async function InventoryPage() {
    const db = await getDashboardData();

    return <InventoryMaster db={db} />;
}

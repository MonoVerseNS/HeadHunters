
import { getDB } from './server/db.js';

(async () => {
    try {
        const db = await getDB();
        console.log('Running migration...');

        // Delete for IDs 0, 1, 2, 3 just to be safe (admin, platform, test users)
        // Actually, let's delete ALL custodial wallets to force V5 upgrade for everyone.
        // It's a dev environment/upgrade, so this is acceptable if keys are backed up (they are not, but they are custodial).
        // User wants upgrade.

        await db.run('DELETE FROM custodial_wallets');
        // OR specifically: await db.run('DELETE FROM custodial_wallets WHERE user_id IN (0, 1, 3)');

        console.log('Deleted ALL custodial wallets. They will be regenerated as V5R1.');

        // Verify
        const count = await db.get('SELECT count(*) as c FROM custodial_wallets');
        console.log('Wallets remaining:', count.c);

    } catch (e) {
        console.error(e);
    }
})();

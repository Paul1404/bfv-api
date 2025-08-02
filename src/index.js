import { bfvApi } from "bfv-api";
const teamIds = [
    "016PBQB78C000000VV0AG80NVV8OQVTB",
    "02IDHSKCTG000000VS5489B2VU2I8R4H",
];
async function fetchMatchesForTeams() {
    for (const teamPermanentId of teamIds) {
        try {
            const { data } = await bfvApi.listMatches({
                params: { teamPermanentId },
            });
            console.log(`\nMatches for team ${teamPermanentId}:`);
            data.matches?.forEach((match) => {
                console.log(`- ${match.matchDate} | ${match.homeTeamName} vs ${match.awayTeamName} | Result: ${match.resultString}`);
            });
        }
        catch (error) {
            console.error(`Error fetching matches for team ${teamPermanentId}:`, error);
        }
    }
}
fetchMatchesForTeams();
//# sourceMappingURL=index.js.map
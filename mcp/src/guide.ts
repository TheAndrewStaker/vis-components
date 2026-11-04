/** The agent guide, bundled into the server (mcp/guide/agent-guide.md). */
import guide from "../guide/agent-guide.md?raw"

export const AGENT_GUIDE: string = guide

/** What the server tells a client up front: the rules a model needs before
 *  its first call, and where the rest is. */
export const SERVER_INSTRUCTIONS =
	"Zafiro makes charts from encodings: say which field goes to which channel (x, y, hue, length, …) and the chart type follows; never pick a chart type first. Before the first chart, call agent_guide and read all of it; it says how to find the primary comparison, which encodings suit which data types, what each set of encodings draws, and the refusals that are yours to make (bar axes start at zero, data isn't edited for looks). Then call chart_vocabulary for the exact channels and families. Colors come from the theme's palettes (list_settings with a chart id), not arbitrary hex."

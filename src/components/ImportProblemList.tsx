/** The bundle parser lists every defect it found so a hand-authored file can
 *  be fixed in one pass; shown under the headline in both import surfaces
 *  (the header's outcome modal and Settings → Sharing). */
export const ImportProblemList = ({ problems }: { problems: string[] }) => (
	<ul className="list-disc pl-5 text-sm vc-text flex flex-col gap-1">
		{problems.map((p) => (
			<li key={p}>{p}</li>
		))}
	</ul>
)

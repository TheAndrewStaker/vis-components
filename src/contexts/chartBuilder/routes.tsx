import { createRoute, rootRoute } from "../../routes/router"
import {
	VisualLoaderForExisting,
	VisualLoaderForNew,
} from "./components/VisualLoader"

export const editorNewRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/editor/new",
	component: VisualLoaderForNew,
	// `?datasetId=…` lets the Header's "New visualization → With this data set"
	// option carry the current dataset across the route change. Without it,
	// VisualLoaderForNew's reset would clear the dataset binding.
	// `?folderId=…` carries the destination folder the same menu asked for;
	// absent = root.
	validateSearch: (
		search: Record<string, unknown>,
	): { datasetId?: string; folderId?: string } => ({
		datasetId:
			typeof search.datasetId === "string" ? search.datasetId : undefined,
		folderId:
			typeof search.folderId === "string" && search.folderId.length > 0
				? search.folderId
				: undefined,
	}),
})

export const editorVisualRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/editor/$visualId",
	component: VisualLoaderForExisting,
})

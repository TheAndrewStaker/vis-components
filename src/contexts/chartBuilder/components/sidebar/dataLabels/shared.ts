import type { DataLabelsEncodings } from "../../../lib/types"

/** The shelf's rows. `r` is excluded: a retired slot kept on the type
 *  only so old saves load (see `DataLabelsEncodings.r`). */
export type DataLabelsChannel = Exclude<keyof DataLabelsEncodings, "r">


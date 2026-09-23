/**
 * The step-by-step guide, as the application loads it.
 *
 * An import list and a re-export on purpose: this file is the seam where the
 * document's stylesheets enter the bundle, and `lazy()` on it in
 * `screens/Report.tsx` is what keeps them out of every other screen's chunk.
 * The component itself is the export's own, unchanged — there is one renderer
 * for the download, the report and the printed PDF (D25, D29).
 */
import '@fontsource-variable/vazirmatn'
import '../../export/steps/steps-base.css'
import { StepsApp } from '../../export/steps/StepsApp'

export default StepsApp

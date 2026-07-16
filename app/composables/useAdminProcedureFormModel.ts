import type { ApiProcedure } from '~~/shared/types/server'
import type { ProcedureAudience } from '~~/shared/constants/server'
import type {
  ProcedureForm,
  ProcedureMaterialForm
} from '~/components/admin/procedure-editor-types'
import { createAdminProcedureFormController } from '~/utils/admin-procedure-form-model'

export function useAdminProcedureFormModel() {
  const controller = createAdminProcedureFormController()
  const form = reactive<ProcedureForm>(controller.createEmptyForm())
  const procedureFormModel = computed({
    get: () => form,
    set: value => Object.assign(form, value)
  })

  return {
    form,
    procedureFormModel,
    resetForm: () => controller.resetForm(form),
    fillForm: (procedure: ApiProcedure) => controller.fillForm(form, procedure),
    toggleAudience: (
      target: { audience: ProcedureAudience[] },
      audience: ProcedureAudience,
      checked: boolean
    ) => controller.toggleAudience(target, audience, checked),
    addStep: () => controller.addStep(form),
    addMaterial: () => controller.addMaterial(form),
    removeStep: (index: number) => controller.removeStep(form, index),
    removeMaterial: (index: number) => controller.removeMaterial(form, index),
    moveStep: (index: number, direction: -1 | 1) => controller.moveStep(form, index, direction),
    moveMaterial: (index: number, direction: -1 | 1) => (
      controller.moveMaterial(form, index, direction)
    ),
    setRequired: (material: ProcedureMaterialForm, value: unknown) => (
      controller.setRequired(material, value)
    )
  }
}

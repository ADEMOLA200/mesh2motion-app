import { type AnimationClip, type SkinnedMesh } from 'three'
import { IncompatibleSkeletonError, NoAnimationsError } from './AnimationImportErrors.ts'

export default class CustomAnimationValidation {
  /**
   * Validates that animation bones are compatible with target skeleton
   * @throws {IncompatibleSkeletonError} If bones don't match
   * @throws {NoAnimationsError} If no recognizable bone tracks found
   */
  static validate_animation_bones_match (
    animation_clips: AnimationClip[],
    skinned_meshes: SkinnedMesh[]
  ): void {
    if (skinned_meshes.length === 0) {
      throw new Error('No skinned meshes available to validate animations.')
    }

    // Get target bone names from skeleton
    const target_bone_names = new Set<string>()
    skinned_meshes.forEach((skinned_mesh) => {
      skinned_mesh.skeleton.bones.forEach((bone) => {
        target_bone_names.add(bone.name.toLowerCase())
      })
    })

    const animation_bone_names = CustomAnimationValidation.get_animation_bone_names(animation_clips)

    if (animation_bone_names.size === 0) {
      throw new NoAnimationsError('Imported animations do not contain recognizable bone tracks.')
    }

    // Check bone count mismatch
    if (animation_bone_names.size !== target_bone_names.size) {
      throw new IncompatibleSkeletonError('bone count mismatch')
    }

    // Check bone name mismatch (animation has bones not in target skeleton)
    const missing_bones = Array.from(animation_bone_names).filter(bone => !target_bone_names.has(bone))
    if (missing_bones.length > 0) {
      throw new IncompatibleSkeletonError('bone names don\'t match')
    }
  }

  /**
   * Gets all bone names referenced in animation clips
   */
  static get_animation_bone_names (animation_clips: AnimationClip[]): Set<string> {
    const bone_names = new Set<string>()
    animation_clips.forEach((clip) => {
      clip.tracks.forEach((track) => {
        const bone_name = CustomAnimationValidation.extract_bone_name_from_track(track.name)
        if (bone_name !== null) {
          bone_names.add(bone_name)
        }
      })
    })
    return bone_names
  }

  /**
   * Extracts bone name from animation track name
   */
  static extract_bone_name_from_track (track_name: string): string | null {
    const bones_match = track_name.match(/\.bones\[([^\]]+)\]\.(?:quaternion|position|scale)$/)
    if (bones_match !== null) {
      return bones_match[1].toLowerCase()
    }

    const simple_match = track_name.match(/^([^.]+)\.(?:quaternion|position|scale)$/)
    if (simple_match !== null) {
      return simple_match[1].toLowerCase()
    }

    return null
  }
}

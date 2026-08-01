<script setup lang="ts">
definePageMeta({
  layout: false,
  middleware: () => navigateTo('/', { redirectCode: 308 })
})
</script>

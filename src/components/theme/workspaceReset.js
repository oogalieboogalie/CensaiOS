export async function resetWorkspaceAndReload({
  expectedRevision,
  resetWorkspace,
  reload,
}) {
  await resetWorkspace(expectedRevision);
  reload();
}

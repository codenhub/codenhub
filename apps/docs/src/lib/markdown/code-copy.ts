export function findCodeCopyStatus(button: HTMLButtonElement): HTMLElement | null {
  const statusId = button.getAttribute("aria-describedby");
  if (statusId === null) {
    return null;
  }
  return button.closest(".code-block")?.querySelector<HTMLElement>(`#${statusId}`) ?? null;
}

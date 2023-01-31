export function getSubGroupFlag(): boolean {
    const token = process.env.EXCLUDE_GITLAB_SUBGROUPS;
    if (token) {
        return true;
    }
    return false;
}
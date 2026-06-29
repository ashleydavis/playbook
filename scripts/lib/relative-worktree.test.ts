// Unit tests for the pure computeRelativeLinks() helper.
//
// The IO wrapper relativizeWorktree() is thin IO over this helper and is
// exercised end-to-end by the smoke tests (smoke-repair-worktrees.sh and the
// extended setup/merge smokes), so it has no separate unit test here.

import { computeRelativeLinks } from "./relative-worktree";

describe("computeRelativeLinks()", () => {
    test("worktree .git is relative; admin back-link is absolute", () => {
        const { dotGit, adminLink } = computeRelativeLinks(
            "/abs/project/worktrees/t1",
            "/abs/project/.git/worktrees/t1",
        );
        // The worktree's own link is relative so it survives a mount-point change.
        expect(dotGit).toBe("gitdir: ../../.git/worktrees/t1\n");
        // The admin back-link stays absolute (git 2.43.0 requires it).
        expect(adminLink).toBe("/abs/project/worktrees/t1/.git\n");
    });

    test("the worktree .git path carries no absolute prefix", () => {
        const { dotGit } = computeRelativeLinks(
            "/abs/project/worktrees/t1",
            "/abs/project/.git/worktrees/t1",
        );
        // strip the `gitdir: ` prefix before checking the path itself
        expect(dotGit.replace("gitdir: ", "").startsWith("/")).toBe(false);
    });

    test("the worktree .git is mount-point independent: same under any root", () => {
        const vm = computeRelativeLinks(
            "/home/ubuntu/repo/project/worktrees/t1",
            "/home/ubuntu/repo/project/.git/worktrees/t1",
        );
        const host = computeRelativeLinks(
            "/host/mnt/repo/project/worktrees/t1",
            "/host/mnt/repo/project/.git/worktrees/t1",
        );
        // The relative worktree link is identical regardless of the absolute root.
        expect(vm.dotGit).toBe(host.dotGit);
        // The admin back-link is absolute, so it tracks the local root.
        expect(vm.adminLink).not.toBe(host.adminLink);
    });
});

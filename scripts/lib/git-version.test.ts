import {
    GitVersionError,
    MIN_GIT_VERSION,
    assertGitVersion,
    meetsMinimum,
    parseGitVersion,
    type Version,
} from "./git-version";

describe("parseGitVersion", () => {
    test("parses a plain version", () => {
        expect(parseGitVersion("git version 2.48.1")).toEqual([2, 48, 1]);
    });

    test("defaults a missing patch to 0", () => {
        expect(parseGitVersion("git version 2.48")).toEqual([2, 48, 0]);
    });

    test("ignores a vendor suffix", () => {
        expect(parseGitVersion("git version 2.39.3 (Apple Git-146)")).toEqual([
            2, 39, 3,
        ]);
    });

    test("returns null when there is no version", () => {
        expect(parseGitVersion("not a version")).toBeNull();
    });
});

describe("meetsMinimum", () => {
    const min: Version = [2, 48, 0];
    test.each<[Version, boolean]>([
        [[2, 48, 0], true],
        [[2, 48, 1], true],
        [[2, 49, 0], true],
        [[3, 0, 0], true],
        [[2, 47, 9], false],
        [[2, 43, 0], false],
        [[1, 99, 99], false],
    ])("%p meets [2,48,0] -> %p", (version, expected) => {
        expect(meetsMinimum(version, min)).toBe(expected);
    });
});

describe("assertGitVersion", () => {
    test("passes on a new-enough git", async () => {
        await expect(
            assertGitVersion(async () => "git version 2.48.0"),
        ).resolves.toBeUndefined();
    });

    test("passes well above the minimum", async () => {
        await expect(
            assertGitVersion(async () => "git version 2.50.1"),
        ).resolves.toBeUndefined();
    });

    test("throws on an older git", async () => {
        await expect(
            assertGitVersion(async () => "git version 2.43.0"),
        ).rejects.toThrow(GitVersionError);
    });

    test("throws when the version cannot be parsed", async () => {
        await expect(
            assertGitVersion(async () => "garbage"),
        ).rejects.toThrow(GitVersionError);
    });

    test("uses 2.48.0 as the shipped minimum", () => {
        expect(MIN_GIT_VERSION).toBe("2.48.0");
    });
});

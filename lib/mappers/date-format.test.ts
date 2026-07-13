import { describe, expect, it } from "vitest";
import { displayDateToIso, isoDateToDisplay, formatCompanyEndDate } from "@/lib/mappers/date-format";

describe("displayDateToIso — tolerant parsing (fixes dropped start dates)", () => {
  it("parses MM/YYYY and M/YYYY", () => {
    expect(displayDateToIso("05/2020")).toBe("2020-05-01");
    expect(displayDateToIso("5/2020")).toBe("2020-05-01");
  });

  it("parses year-only", () => {
    expect(displayDateToIso("2020")).toBe("2020-01-01");
  });

  it("parses month names", () => {
    expect(displayDateToIso("May 2020")).toBe("2020-05-01");
    expect(displayDateToIso("Jan 2020")).toBe("2020-01-01");
    expect(displayDateToIso("September 2019")).toBe("2019-09-01");
    expect(displayDateToIso("Sept. 2019")).toBe("2019-09-01");
  });

  it("parses ISO and mixed separators", () => {
    expect(displayDateToIso("2020-05")).toBe("2020-05-01");
    expect(displayDateToIso("2020-05-14")).toBe("2020-05-01");
    expect(displayDateToIso("05-2020")).toBe("2020-05-01");
    expect(displayDateToIso("2020/05")).toBe("2020-05-01");
  });

  it("returns null for Present and blanks", () => {
    expect(displayDateToIso("Present")).toBeNull();
    expect(displayDateToIso("")).toBeNull();
    expect(displayDateToIso(null)).toBeNull();
  });
});

describe("isoDateToDisplay", () => {
  it("renders stored ISO dates as MM/YYYY", () => {
    expect(isoDateToDisplay("2020-05-01")).toBe("05/2020");
    expect(isoDateToDisplay("2020-5")).toBe("05/2020");
  });

  it("passes through and normalizes MM/YYYY and Present", () => {
    expect(isoDateToDisplay("5/2020")).toBe("05/2020");
    expect(isoDateToDisplay("Present")).toBe("Present");
  });

  it("round-trips year and month-name entries through ISO", () => {
    expect(isoDateToDisplay(displayDateToIso("2020"))).toBe("01/2020");
    expect(isoDateToDisplay(displayDateToIso("May 2020"))).toBe("05/2020");
  });
});

describe("formatCompanyEndDate", () => {
  it("shows Present for current roles or unparseable end dates", () => {
    expect(formatCompanyEndDate("2022-03-01", true)).toBe("Present");
    expect(formatCompanyEndDate(null, false)).toBe("Present");
    expect(formatCompanyEndDate("2022-03-01", false)).toBe("03/2022");
  });
});

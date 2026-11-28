import { describe, expect, it } from "vitest";
import { tidyCase } from "./lib/addressCase";

describe("addresses from the rolls, in normal capitals", () => {
  it("streets and cities", () => {
    expect(tidyCase("100 BIG SPRING ST")).toBe("100 Big Spring St");
    expect(tidyCase("DALLAS")).toBe("Dallas");
    expect(tidyCase("4600 N GARFIELD ST STE 12B")).toBe("4600 N Garfield St Ste 12B");
    expect(tidyCase("PO BOX 1234")).toBe("PO Box 1234");
    expect(tidyCase("2210 W IH-20")).toBe("2210 W IH-20");
    expect(tidyCase("1200 FM 1788")).toBe("1200 FM 1788");
    expect(tidyCase("311 E 1ST ST")).toBe("311 E 1st St");
    expect(tidyCase("O'DONNELL")).toBe("O'Donnell");
    expect(tidyCase("WINSTON-SALEM")).toBe("Winston-Salem");
  });
  it("leaves text already in mixed case, and nothing, alone", () => {
    expect(tidyCase("100 McKinney Ave")).toBe("100 McKinney Ave");
    expect(tidyCase(undefined)).toBeUndefined();
    expect(tidyCase("")).toBe("");
  });
});

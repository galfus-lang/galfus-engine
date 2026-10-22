CC ?= gcc
CFLAGS ?= -O2 -Wall -I../../../../sdk/c
LDFLAGS ?= -L../../../../build/cargo-target/debug -lgalfus_native -Wl,-rpath,'$$ORIGIN/../../../../build/cargo-target/debug' -lm

all: tour_c

tour_c: main.c
	$(CC) $(CFLAGS) main.c $(LDFLAGS) -o tour_c

run: tour_c
	./tour_c

clean:
	rm -f tour_c

.PHONY: all run clean

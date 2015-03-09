ASSETS = buid/test/assets
ONEJS = node_modules/one/bin/onejs
COFFEE = test/node_modules/coffee-script/bin/coffee
NODE = node
CCOFFEE = node_modules/compiled-coffee/bin/ccoffee
# CCOFFEE = node_modules/compiled-coffee/bin/ccoffee-osx

all:
	make build
	make build-test


build:
	$(CCOFFEE) -o build -i src -p "asyncmachine.js:asyncmachine"

build-watch:
	$(CCOFFEE) -o build -i src --watch -p "asyncmachine.js:asyncmachine"

server:
	node_modules/http-server/bin/http-server
	
example-basic:
	6to5 examples/basic/basic.js --out-file examples/basic/basic.es5.js
	node examples/basic/basic.es5.js
	
setup:
	npm install

test:
	./node_modules/mocha/bin/mocha \
		--harmony \
		--compilers mocha --compilers coffee:coffee-script/register \
		--reporter spec \
		test/*.coffee

test-grep:
	./node_modules/mocha/bin/mocha \
		--harmony \
		--compilers mocha --compilers coffee:coffee-script/register \
		--reporter spec \
		--grep "$(GREP)"
		test/*.coffee

test-debug:
	./node_modules/mocha/bin/mocha \
		--harmony \
		--debug-brk \
		--compilers coffee:coffee-script \
		--reporter spec \
		--grep "$(GREP)" \
		test/*.coffee

test-grep-debug:
	./node_modules/mocha/bin/mocha \
		--harmony \
		--debug-brk \
		--compilers mocha --compilers coffee:coffee-script/register \
		--reporter spec \
		--grep "$(GREP)" \
		test/*.coffee

docs:
	./node_modules/typedoc-v2/bin/typedoc \
		--out docs/ \
		--module commonjs \
		--name AsyncMachine \
		build/asyncmachine.ts

spec:
	echo "<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><pre>" > docs/spec.html
	./node_modules/mocha/bin/mocha \
		--harmony \
		--compilers mocha --compilers coffee:coffee-script/register \
		--reporter spec \
		test/*.coffee >> docs/spec.html
	echo "</pre></body></html>" >> docs/spec.html


build-vis:
	$(CCOFFEE) -o build/visualizer -i src/visualizer -p "asyncmachine-vis.js:am-visualizer"

build-vis-watch:
	$(CCOFFEE) -o build/visualizer -i src/visualizer \
		--watch -p "asyncmachine.js:asyncmachine"

test-vis:
	./node_modules/mocha/bin/mocha \
		--harmony \
		--compilers mocha --compilers coffee:coffee-script/register \
		--reporter spec \
		test/visualizer.coffee

test-vis-debug:
	./node_modules/mocha/bin/mocha \
		--harmony \
		--debug-brk \
		--compilers coffee:coffee-script \
		--reporter spec \
		--grep "$(GREP)" \
		test/visualizer.coffee
	
.PHONY: build test docs

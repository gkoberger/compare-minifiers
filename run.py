import copy
import math
import os
import time
from subprocess import call, PIPE, Popen

from compilers import JS_COMPILERS, CSS_COMPILERS

def compile(compilers, folder):
    # Get a list of files
    to_compile = os.listdir(folder)

    for f in to_compile:
        print "File: %s" % f
        print "".rjust(15), "Time".rjust(15), "Orig Size".rjust(15), "Compressed".rjust(15), "Change".rjust(10)

        with open('./%s/%s' % (folder, f)) as file:
            original = len(file.read())

        for c in compilers:
            full_command = copy.copy(c[1])
            fname = ("./%s/%s" % (folder, f))
            if "%s" in full_command:
                full_command[full_command.index("%s")] = fname
            else:
                full_command.append(fname)
            t0 = time.time()
            output = Popen(full_command, stdout=PIPE, stderr = open('/dev/null', 'w')).communicate()
            t1 = time.time()
            t = t1 - t0

            compressed = len(output[0])

            percentage = (float(compressed)/original * 100)
            change = "-%d%%" % (100 - int(math.floor(percentage)))

            row = '{0:15s} {1:15f} {2:15d} {3:15d} {4:10s}'
            print row.format(c[0], t, original, compressed, change.rjust(10))

        print "\n=============================\n"

if __name__ == '__main__':
    # Run the JS minifiers
    print "JS MINIFICATION"
    compile(JS_COMPILERS, 'js_files')

    print "\n\n"

    # Run the CSS minifiers
    print "CSS MINIFICATION"
    compile(CSS_COMPILERS, 'css_files')
